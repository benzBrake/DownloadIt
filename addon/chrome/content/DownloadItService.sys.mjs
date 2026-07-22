import {
  buildDownloadJob,
  isSupportedURL,
  parseAvailableManagers,
} from "./DownloadItProtocol.sys.mjs";
import { DownloadItContextMenuController } from "./DownloadItContextMenu.sys.mjs";
import { initializeDownloadItLocalization } from "./DownloadItLocalization.sys.mjs";
import {
  BINARY_SIZE,
  BINARY_SHA256,
} from "./DownloadItBinaryMetadata.sys.mjs";
import {
  getCookieHeader,
  getManagerOutputEncoding,
} from "./DownloadItUtils.sys.mjs";

const { classes: Cc, interfaces: Ci } = Components;

const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;
const IOUtils = globalThis.IOUtils;
const PathUtils = globalThis.PathUtils;
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

if (!IOUtils || !PathUtils) {
  throw new Error("DownloadIt requires the Firefox IOUtils and PathUtils globals");
}

const BINARY_RESOURCE = "FlashGot.exe";
const BINARY_NAME = "FlashGot.exe";
const PROFILE_DIRECTORY = "DownloadIt";

const PREF_DEFAULT_MANAGER = "downloadit.defaultDM";
const PREF_MANAGER_CACHE = "downloadit.detectedManagers";
const PREF_OMIT_COOKIES = "downloadit.omitCookies";

const BROWSER_WINDOW_URL = "chrome://browser/content/browser.xhtml";
const SETTINGS_URL = "chrome://downloadit/content/options.xhtml";
const APP_LOCALES_CHANGED_TOPIC = "intl:app-locales-changed";

let activeService = null;

export class DownloadItError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "DownloadItError";
    this.code = code;
    this.args = args;
  }
}

export function registerActiveService(service) {
  activeService = service;
}

export function unregisterActiveService(service) {
  if (activeService === service) {
    activeService = null;
  }
}

export function getActiveService() {
  return activeService;
}

export function openSettingsWindow(parentWindow = null) {
  const windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    const window = windows.getNext();
    if (window.closed) {
      continue;
    }
    try {
      if (window.document.documentURI === SETTINGS_URL) {
        window.focus();
        return window;
      }
    } catch {}
  }

  const opener = parentWindow && !parentWindow.closed
    ? parentWindow
    : Services.wm.getMostRecentWindow("navigator:browser");
  if (!opener?.openDialog) {
    return null;
  }
  return opener.openDialog(
    SETTINGS_URL,
    "downloadit-options",
    "chrome,titlebar,toolbar,centerscreen,resizable,width=1100,height=760",
  );
}

export class DownloadItService {
  constructor(addonData) {
    this.addonData = addonData;
    this.binaryPath = "";
    this.managers = this.loadManagerCache();
    this.controllers = new Map();
    this.temporaryFiles = new Set();
    this.refreshPromise = null;
  }

  get defaultManager() {
    const configured = Services.prefs.getStringPref(PREF_DEFAULT_MANAGER, "");
    return this.managers.includes(configured) ? configured : this.managers[0] || "";
  }

  set defaultManager(value) {
    Services.prefs.setStringPref(PREF_DEFAULT_MANAGER, String(value || ""));
  }

  readSettings() {
    const configuredDefaultManager = Services.prefs.getStringPref(
      PREF_DEFAULT_MANAGER,
      "",
    );
    const managers = [...this.managers];
    return {
      managers,
      configuredDefaultManager,
      defaultManager: managers.includes(configuredDefaultManager)
        ? configuredDefaultManager
        : managers[0] || "",
      omitCookies: Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false),
      defaultManagerLocked: Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER),
      omitCookiesLocked: Services.prefs.prefIsLocked(PREF_OMIT_COOKIES),
      binaryPath: this.binaryPath,
      serviceReady: Boolean(this.binaryPath),
      platformSupported: Services.appinfo.OS === "WINNT",
    };
  }

  applySettings({ defaultManager = "", omitCookies = false } = {}) {
    const manager = String(defaultManager || "");
    const configuredDefaultManager = Services.prefs.getStringPref(
      PREF_DEFAULT_MANAGER,
      "",
    );
    const currentOmitCookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false);

    if (manager && !this.managers.includes(manager)) {
      throw new Error(`Unsupported download manager: ${manager}`);
    }
    const defaultManagerLocked = Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER);
    const configuredManagerIsAvailable = this.managers.includes(configuredDefaultManager);
    if (
      defaultManagerLocked &&
      manager &&
      configuredManagerIsAvailable &&
      manager !== configuredDefaultManager
    ) {
      throw new Error("The default download manager preference is locked");
    }
    if (
      Services.prefs.prefIsLocked(PREF_OMIT_COOKIES) &&
      Boolean(omitCookies) !== currentOmitCookies
    ) {
      throw new Error("The cookie preference is locked");
    }

    if (manager && !defaultManagerLocked) {
      this.defaultManager = manager;
    }
    if (Boolean(omitCookies) !== currentOmitCookies) {
      Services.prefs.setBoolPref(PREF_OMIT_COOKIES, Boolean(omitCookies));
    }
    return this.readSettings();
  }

  async startup() {
    if (Services.appinfo.OS !== "WINNT") {
      throw new Error("DownloadIt currently supports Windows only");
    }

    this.binaryPath = await this.deployBinary();
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, APP_LOCALES_CHANGED_TOPIC);

    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      const window = windows.getNext();
      if (window.location.href === BROWSER_WINDOW_URL && window.gBrowserInit?.delayedStartupFinished) {
        this.attachWindow(window);
      }
    }

    try {
      await this.refreshManagers();
    } catch (error) {
      console.error("DownloadIt: initial download manager scan failed", error);
    }
  }

  async shutdown() {
    try {
      Services.obs.removeObserver(this, "browser-delayed-startup-finished");
    } catch {}
    try {
      Services.obs.removeObserver(this, APP_LOCALES_CHANGED_TOPIC);
    } catch {}

    for (const controller of this.controllers.values()) {
      controller.destroy();
    }
    this.controllers.clear();

    await Promise.allSettled(
      Array.from(this.temporaryFiles, path => this.removeTemporaryFile(path))
    );
  }

  observe(subject, topic) {
    if (topic === "browser-delayed-startup-finished") {
      this.attachWindow(subject);
    } else if (topic === APP_LOCALES_CHANGED_TOPIC) {
      for (const controller of this.controllers.values()) {
        controller.localizationReady
          .then(() => controller.refreshMenuLabel())
          .catch(error => {
            console.error("DownloadIt: context-menu locale refresh failed", error);
          });
      }
    }
  }

  attachWindow(window) {
    if (
      !window ||
      window.closed ||
      window.location.href !== BROWSER_WINDOW_URL ||
      this.controllers.has(window)
    ) {
      return;
    }

    try {
      const controller = new DownloadItContextMenuController(
        this,
        window,
        initializeDownloadItLocalization,
      );
      controller.init();
      this.controllers.set(window, controller);
      window.addEventListener("unload", () => {
        controller.destroy();
        this.controllers.delete(window);
      }, { once: true });
    } catch (error) {
      console.error("DownloadIt: browser window initialization failed", error);
    }
  }

  loadManagerCache() {
    try {
      const cached = JSON.parse(Services.prefs.getStringPref(PREF_MANAGER_CACHE, "[]"));
      return Array.isArray(cached)
        ? cached.filter(value => typeof value === "string" && value.trim())
        : [];
    } catch {
      return [];
    }
  }

  async refreshManagers({ persistDefault = true } = {}) {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const outputPath = this.createTemporaryPath("managers", ".json");
      try {
        await this.runProcess(["--list-json", outputPath]);
        const raw = (await this.readManagerOutput(outputPath)).replace(/^\uFEFF/, "");
        const managers = parseAvailableManagers(JSON.parse(raw));
        this.managers = managers;
        Services.prefs.setStringPref(PREF_MANAGER_CACHE, JSON.stringify(managers));

        if (persistDefault && managers.length && !managers.includes(
          Services.prefs.getStringPref(PREF_DEFAULT_MANAGER, "")
        )) {
          this.defaultManager = managers[0];
        }
        return [...managers];
      } finally {
        await this.removeTemporaryFile(outputPath);
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async readManagerOutput(path) {
    try {
      return await IOUtils.readUTF8(path);
    } catch (error) {
      if (error?.name !== "NotReadableError") {
        throw error;
      }
      const bytes = await IOUtils.read(path);
      return new TextDecoder(
        getManagerOutputEncoding(Services.locale.appLocaleAsBCP47)
      ).decode(bytes);
    }
  }

  async downloadLink(context, manager) {
    if (!this.managers.includes(manager)) {
      throw new Error(`Unsupported download manager: ${manager}`);
    }
    if (!isSupportedURL(context.url)) {
      throw new DownloadItError("unsupported-url");
    }

    const uri = Services.io.newURI(context.url);
    const pageReferrerURI = context.downloadPageReferer && isSupportedURL(
      context.downloadPageReferer
    ) ? Services.io.newURI(context.downloadPageReferer) : null;
    const omitCookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false);
    const cookieOptions = {
      cookieService: Services.cookies,
      eTLDService: Services.eTLD,
    };
    const cookies = omitCookies
      ? ""
      : getCookieHeader(uri, context.browser, cookieOptions);
    const downloadPageCookies = omitCookies || !pageReferrerURI
      ? ""
      : getCookieHeader(pageReferrerURI, context.browser, cookieOptions);
    const userAgent = context.browser?.browsingContext?.customUserAgent ||
      Cc["@mozilla.org/network/protocol;1?name=http"]
        .getService(Ci.nsIHttpProtocolHandler).userAgent;

    const job = buildDownloadJob({
      manager,
      url: context.url,
      description: context.description,
      filename: context.filename,
      referer: isSupportedURL(context.referer) ? context.referer : "",
      downloadPageReferer: pageReferrerURI?.spec || "",
      downloadPageCookies,
      cookies,
      userAgent,
    });

    const inputPath = this.createTemporaryPath("job", ".json");
    try {
      await IOUtils.writeUTF8(inputPath, JSON.stringify(job));
      await this.runProcess(["--job-json", inputPath]);
    } finally {
      await this.removeTemporaryFile(inputPath);
    }
  }

  alert(window, message) {
    Services.prompt.alert(window, "DownloadIt", String(message));
  }

  openSettings(parentWindow = null) {
    return openSettingsWindow(parentWindow);
  }

  createTemporaryPath(prefix, extension) {
    const id = Services.uuid.generateUUID().toString().replace(/[{}-]/g, "");
    const path = PathUtils.join(PathUtils.tempDir, `downloadit-${prefix}-${id}${extension}`);
    this.temporaryFiles.add(path);
    return path;
  }

  async removeTemporaryFile(path) {
    this.temporaryFiles.delete(path);
    await IOUtils.remove(path, { ignoreAbsent: true });
  }

  async runProcess(argumentsList) {
    const executable = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    executable.initWithPath(this.binaryPath);
    if (!executable.exists() || !executable.isFile()) {
      throw new Error(`DownloadIt helper executable not found: ${this.binaryPath}`);
    }

    const process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    process.init(executable);
    process.startHidden = true;

    await new Promise((resolve, reject) => {
      const observer = {
        observe(subject, topic) {
          if (topic !== "process-finished") {
            reject(new Error(`DownloadIt helper process failed: ${topic}`));
            return;
          }
          const exitValue = process.exitValue;
          if (exitValue === 0) {
            resolve();
          } else {
            reject(new Error(`DownloadIt helper exited with code ${exitValue}`));
          }
        },
      };

      try {
        process.runwAsync(argumentsList, argumentsList.length, observer);
      } catch (error) {
        reject(error);
      }
    });
  }

  async deployBinary() {
    const directory = PathUtils.join(PathUtils.profileDir, PROFILE_DIRECTORY);
    const destination = PathUtils.join(directory, BINARY_NAME);
    await IOUtils.makeDirectory(directory, { ignoreExisting: true });

    let currentBinaryIsValid = false;
    try {
      const stat = await IOUtils.stat(destination);
      currentBinaryIsValid = stat.size === BINARY_SIZE;
      if (currentBinaryIsValid && typeof IOUtils.computeHexDigest === "function") {
        const digest = await IOUtils.computeHexDigest(destination, "sha256");
        currentBinaryIsValid = digest.toLowerCase() === BINARY_SHA256;
      }
    } catch {}

    if (!currentBinaryIsValid) {
      const source = this.addonData.resourceURI.resolve(BINARY_RESOURCE);
      const bytes = await this.readResourceBytes(source);
      const temporaryDestination = `${destination}.tmp`;
      await IOUtils.remove(temporaryDestination, { ignoreAbsent: true });
      try {
        await IOUtils.write(destination, bytes, { tmpPath: temporaryDestination });
      } finally {
        await IOUtils.remove(temporaryDestination, { ignoreAbsent: true });
      }
    }
    return destination;
  }

  async readResourceBytes(uri) {
    const channel = NetUtil.newChannel({
      uri,
      loadUsingSystemPrincipal: true,
    });
    const inputStream = await new Promise((resolve, reject) => {
      NetUtil.asyncFetch(channel, (stream, status) => {
        if (!Components.isSuccessCode(status)) {
          reject(new Error(`Could not read ${uri}: 0x${status.toString(16)}`));
          return;
        }
        resolve(stream);
      });
    });

    const binaryStream = Cc["@mozilla.org/binaryinputstream;1"]
      .createInstance(Ci.nsIBinaryInputStream);
    binaryStream.setInputStream(inputStream);
    try {
      return Uint8Array.from(binaryStream.readByteArray(binaryStream.available()));
    } finally {
      binaryStream.close();
    }
  }
}
