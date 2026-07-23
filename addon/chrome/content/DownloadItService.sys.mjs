import {
  buildDownloadBatchJob,
  isSupportedURL,
  parseAvailableManagers,
} from "./DownloadItProtocol.sys.mjs";
import { DownloadItContextMenuController } from "./DownloadItContextMenu.sys.mjs";
import {
  DownloadItDownloadDialogController,
  normalizeAutoExtensions,
  registerDownloadItHelperAppHook,
  unregisterDownloadItHelperAppHook,
  isDownloadDialogWindow,
} from "./DownloadItDownloadDialog.sys.mjs";
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
const PREF_AUTO_EXTENSIONS = "downloadit.autoExtensions";

const BROWSER_WINDOW_URL = "chrome://browser/content/browser.xhtml";
const SETTINGS_URL = "chrome://downloadit/content/options.xhtml";
const DOWNLOAD_DIALOG_TOPIC = "domwindowopened";
const APP_LOCALES_CHANGED_TOPIC = "intl:app-locales-changed";
const SELECTION_ACTOR_NAME = "DownloadItSelection";
const SELECTION_ACTOR_URI = "chrome://downloadit/content/DownloadItSelectionActor.sys.mjs";

let activeService = null;
let selectionActorRegistered = false;

function registerSelectionActor() {
  if (selectionActorRegistered) {
    return;
  }
  ChromeUtils.registerWindowActor(SELECTION_ACTOR_NAME, {
    parent: {
      esModuleURI: SELECTION_ACTOR_URI,
    },
    child: {
      esModuleURI: SELECTION_ACTOR_URI,
    },
    allFrames: true,
    matches: ["<all_urls>"],
  });
  selectionActorRegistered = true;
}

function unregisterSelectionActor() {
  if (!selectionActorRegistered) {
    return;
  }
  try {
    ChromeUtils.unregisterWindowActor(SELECTION_ACTOR_NAME);
  } catch (error) {
    console.error("DownloadIt: selection Actor unregister failed", error);
  }
  selectionActorRegistered = false;
}

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
    this.downloadDialogControllers = new Map();
    this.downloadDialogWatchers = new Map();
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

  get autoExtensions() {
    try {
      const value = JSON.parse(
        Services.prefs.getStringPref(PREF_AUTO_EXTENSIONS, "[]"),
      );
      return Array.isArray(value) ? normalizeAutoExtensions(value) : [];
    } catch {
      return [];
    }
  }

  get autoExtensionsLocked() {
    return Services.prefs.prefIsLocked(PREF_AUTO_EXTENSIONS);
  }

  hasAutoExtension(value) {
    const extension = normalizeAutoExtensions([value])[0] || "";
    return Boolean(extension && this.autoExtensions.includes(extension));
  }

  setAutoExtension(value, enabled) {
    if (this.autoExtensionsLocked) {
      throw new Error("The automatic extension preference is locked");
    }
    const extension = normalizeAutoExtensions([value])[0] || "";
    if (!extension) {
      return this.autoExtensions;
    }
    const current = new Set(this.autoExtensions);
    if (enabled) {
      current.add(extension);
    } else {
      current.delete(extension);
    }
    const next = normalizeAutoExtensions([...current]);
    Services.prefs.setStringPref(PREF_AUTO_EXTENSIONS, JSON.stringify(next));
    return next;
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
      autoExtensions: this.autoExtensions,
      defaultManagerLocked: Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER),
      omitCookiesLocked: Services.prefs.prefIsLocked(PREF_OMIT_COOKIES),
      autoExtensionsLocked: this.autoExtensionsLocked,
      binaryPath: this.binaryPath,
      serviceReady: Boolean(this.binaryPath),
      platformSupported: Services.appinfo.OS === "WINNT",
    };
  }

  applySettings({
    defaultManager = "",
    omitCookies = false,
    autoExtensions = null,
  } = {}) {
    const manager = String(defaultManager || "");
    const currentAutoExtensions = this.autoExtensions;
    const requestedAutoExtensions = autoExtensions == null
      ? currentAutoExtensions
      : normalizeAutoExtensions(autoExtensions);
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
    if (
      this.autoExtensionsLocked &&
      JSON.stringify(requestedAutoExtensions) !== JSON.stringify(currentAutoExtensions)
    ) {
      throw new Error("The automatic extension preference is locked");
    }

    if (manager && !defaultManagerLocked) {
      this.defaultManager = manager;
    }
    if (Boolean(omitCookies) !== currentOmitCookies) {
      Services.prefs.setBoolPref(PREF_OMIT_COOKIES, Boolean(omitCookies));
    }
    if (
      JSON.stringify(requestedAutoExtensions) !== JSON.stringify(currentAutoExtensions)
    ) {
      Services.prefs.setStringPref(
        PREF_AUTO_EXTENSIONS,
        JSON.stringify(requestedAutoExtensions),
      );
    }
    return this.readSettings();
  }

  async startup() {
    if (Services.appinfo.OS !== "WINNT") {
      throw new Error("DownloadIt currently supports Windows only");
    }

    this.binaryPath = await this.deployBinary();
    registerSelectionActor();
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, APP_LOCALES_CHANGED_TOPIC);
    Services.obs.addObserver(this, DOWNLOAD_DIALOG_TOPIC);

    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      const window = windows.getNext();
      if (window.location.href === BROWSER_WINDOW_URL && window.gBrowserInit?.delayedStartupFinished) {
        this.attachWindow(window);
      }
    }

    const openWindows = Services.wm.getEnumerator(null);
    while (openWindows.hasMoreElements()) {
      const window = openWindows.getNext();
      if (isDownloadDialogWindow(window)) {
        this.watchDownloadDialog(window);
      }
    }

    registerDownloadItHelperAppHook(this);

    try {
      await this.refreshManagers();
    } catch (error) {
      console.error("DownloadIt: initial download manager scan failed", error);
    }
  }

  async shutdown() {
    unregisterDownloadItHelperAppHook(this);
    try {
      Services.obs.removeObserver(this, "browser-delayed-startup-finished");
    } catch {}
    try {
      Services.obs.removeObserver(this, APP_LOCALES_CHANGED_TOPIC);
    } catch {}
    try {
      Services.obs.removeObserver(this, DOWNLOAD_DIALOG_TOPIC);
    } catch {}

    unregisterSelectionActor();

    for (const controller of this.controllers.values()) {
      controller.destroy();
    }
    this.controllers.clear();
    for (const controller of this.downloadDialogControllers.values()) {
      controller.destroy();
    }
    this.downloadDialogControllers.clear();
    for (const [window, timer] of this.downloadDialogWatchers) {
      window.clearTimeout(timer);
    }
    this.downloadDialogWatchers.clear();

    await Promise.allSettled(
      Array.from(this.temporaryFiles, path => this.removeTemporaryFile(path))
    );
  }

  observe(subject, topic) {
    if (topic === "browser-delayed-startup-finished") {
      this.attachWindow(subject);
    } else if (topic === DOWNLOAD_DIALOG_TOPIC) {
      this.watchDownloadDialog(subject);
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

  watchDownloadDialog(window) {
    if (
      !window?.addEventListener ||
      this.downloadDialogControllers.has(window) ||
      this.downloadDialogWatchers.has(window)
    ) {
      return;
    }

    let attempts = 0;
    const attach = () => {
      this.downloadDialogWatchers.delete(window);
      if (window.closed) {
        return;
      }
      if (isDownloadDialogWindow(window) && window.dialog?.mLauncher) {
        this.attachDownloadDialog(window);
        return;
      }

      const href = String(window.location?.href || "").replace(/\?.*$/, "");
      const canStillBecomeDownloadDialog = !href || href === "about:blank" ||
        isDownloadDialogWindow(window);
      if (!canStillBecomeDownloadDialog || attempts++ >= 40) {
        return;
      }
      const timer = window.setTimeout(attach, 50);
      this.downloadDialogWatchers.set(window, timer);
    };
    window.addEventListener("load", attach, { once: true });
    attach();
  }

  attachDownloadDialog(window) {
    if (
      !window ||
      window.closed ||
      !isDownloadDialogWindow(window) ||
      this.downloadDialogControllers.has(window)
    ) {
      return;
    }

    const controller = new DownloadItDownloadDialogController(
      this,
      window,
      initializeDownloadItLocalization,
    );
    this.downloadDialogControllers.set(window, controller);
    controller.init().then(initialized => {
      if (!initialized) {
        controller.destroy();
        this.downloadDialogControllers.delete(window);
      }
    }).catch(error => {
      console.error("DownloadIt: download dialog initialization failed", error);
      controller.destroy();
      this.downloadDialogControllers.delete(window);
    });
    window.addEventListener("unload", () => {
      const timer = this.downloadDialogWatchers.get(window);
      if (timer) {
        window.clearTimeout(timer);
        this.downloadDialogWatchers.delete(window);
      }
      controller.destroy();
      this.downloadDialogControllers.delete(window);
    }, { once: true });
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

  async getManagersForDownloadDialog() {
    if (this.managers.length > 0) {
      return [...this.managers];
    }
    try {
      return await this.refreshManagers({ persistDefault: false });
    } catch {
      return [];
    }
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
    return this.downloadLinks([context], manager);
  }

  async downloadLauncher({
    launcher,
    context = null,
    dialogWindow = null,
    manager,
    filename = "",
  } = {}) {
    const source = launcher?.source;
    if (!source?.spec || !isSupportedURL(source.spec)) {
      throw new DownloadItError("unsupported-url");
    }

    const sourceWindow = this.getLauncherSourceWindow(context);
    const browser = sourceWindow?.docShell?.chromeEventHandler ||
      this.getBrowserWindow(dialogWindow)?.gBrowser?.selectedBrowser ||
      null;
    const downloadPageReferer = browser?.currentURI?.spec ||
      sourceWindow?.location?.href || "";
    const referer = source.referrerInfo?.originalReferrer?.spec || "";
    return this.downloadLink({
      url: source.spec,
      description: launcher.suggestedFileName || source.spec,
      filename: filename || launcher.suggestedFileName || "",
      browser,
      referer,
      downloadPageReferer,
    }, manager);
  }

  getLauncherSourceWindow(context) {
    try {
      return context?.getInterface?.(Ci.nsIDOMWindow) || null;
    } catch {
      return null;
    }
  }

  getBrowserWindow(window) {
    if (window?.location?.href === BROWSER_WINDOW_URL) {
      return window;
    }
    return Services.wm.getMostRecentWindow("navigator:browser");
  }

  async downloadLinks(contexts, manager) {
    if (!this.managers.includes(manager)) {
      throw new Error(`Unsupported download manager: ${manager}`);
    }
    if (!Array.isArray(contexts) || contexts.length === 0) {
      throw new DownloadItError("unsupported-url");
    }

    const pageContext = contexts[0] || {};
    const browser = pageContext.browser;
    const pageReferrerURI = pageContext.downloadPageReferer && isSupportedURL(
      pageContext.downloadPageReferer
    ) ? Services.io.newURI(pageContext.downloadPageReferer) : null;
    const omitCookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false);
    const cookieOptions = {
      cookieService: Services.cookies,
      eTLDService: Services.eTLD,
    };
    const downloadPageCookies = omitCookies || !pageReferrerURI
      ? ""
      : getCookieHeader(pageReferrerURI, browser, cookieOptions);
    const userAgent = browser?.browsingContext?.customUserAgent ||
      Cc["@mozilla.org/network/protocol;1?name=http"]
        .getService(Ci.nsIHttpProtocolHandler).userAgent;

    const links = [];
    for (const context of contexts) {
      if (!isSupportedURL(context?.url)) {
        continue;
      }
      const uri = Services.io.newURI(context.url);
      links.push({
        url: context.url,
        description: context.description,
        filename: context.filename,
        cookies: omitCookies
          ? ""
          : getCookieHeader(uri, context.browser || browser, cookieOptions),
      });
    }

    if (links.length === 0) {
      throw new DownloadItError("unsupported-url");
    }

    const job = buildDownloadBatchJob({
      manager,
      links,
      referer: isSupportedURL(pageContext.referer) ? pageContext.referer : "",
      downloadPageReferer: pageReferrerURI?.spec || "",
      downloadPageCookies,
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
