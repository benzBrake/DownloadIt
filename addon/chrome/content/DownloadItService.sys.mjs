import {
  buildDownloadJob,
  isSupportedURL,
  parseAvailableManagers,
} from "./DownloadItProtocol.sys.mjs";
import { DownloadItContextMenuController } from "./DownloadItContextMenu.sys.mjs";
import {
  BINARY_SIZE,
  BINARY_SHA256,
} from "./DownloadItBinaryMetadata.sys.mjs";

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

let activeService = null;

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
    "chrome,titlebar,toolbar,centerscreen,resizable",
  );
}

function getManagerOutputEncoding() {
  const locale = Services.locale.appLocaleAsBCP47.toLowerCase();
  if (locale === "zh-cn") {
    return "gbk";
  }
  if (locale === "zh-tw" || locale === "zh-hk") {
    return "big5";
  }
  return "windows-1252";
}

const MESSAGES = {
  "en-US": {
    root: "Download with DownloadIt",
    defaultDownload: "Download this link with %s",
    noManager: "No supported download manager was detected",
    refresh: "Detect download managers again",
    refreshDone: "%s supported download manager(s) detected.",
    scanFailed: "Could not detect download managers: %s",
    settings: "DownloadIt settings",
    downloadFailed: "Could not send the link to %s: %s",
    unsupported: "This link type cannot be sent to DownloadIt.",
  },
  "zh-CN": {
    root: "使用 DownloadIt 下载",
    defaultDownload: "使用 %s 下载此链接",
    noManager: "未检测到支持的下载工具",
    refresh: "重新检测下载工具",
    refreshDone: "检测到 %s 个支持的下载工具。",
    scanFailed: "无法检测下载工具：%s",
    settings: "DownloadIt 设置",
    downloadFailed: "无法将链接发送到 %s：%s",
    unsupported: "此链接类型无法发送到 DownloadIt。",
  },
};

function getBaseDomain(uri) {
  const host = uri?.asciiHost || uri?.host || "";
  if (!host) {
    return "";
  }
  try {
    return Services.eTLD.getBaseDomainFromHost(host);
  } catch {
    return host;
  }
}

function cookieMatchesURI(cookie, uri) {
  const requestHost = String(uri.asciiHost || uri.host || "").toLowerCase();
  const cookieHost = String(cookie.host || "").replace(/^\./, "").toLowerCase();
  const requestPath = uri.filePath || "/";
  const cookiePath = cookie.path || "/";

  if (!requestHost || !cookieHost || !cookie.name) {
    return false;
  }
  if (cookie.isDomain) {
    if (requestHost !== cookieHost && !requestHost.endsWith(`.${cookieHost}`)) {
      return false;
    }
  } else if (requestHost !== cookieHost) {
    return false;
  }
  if (requestPath !== cookiePath && !requestPath.startsWith(
    cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`
  )) {
    return false;
  }
  if (cookie.isSecure && !uri.schemeIs("https")) {
    return false;
  }
  return !(Number(cookie.expires) > 0 && Number(cookie.expires) * 1000 <= Date.now());
}

function getCookieHeader(uri, browser) {
  if (!uri?.schemeIs("http") && !uri?.schemeIs("https")) {
    return "";
  }

  const baseDomain = getBaseDomain(uri);
  const originAttributes = {
    ...(browser?.contentPrincipal?.originAttributes || {}),
  };
  const plans = [originAttributes];
  if (originAttributes.partitionKey) {
    const unpartitioned = { ...originAttributes };
    delete unpartitioned.partitionKey;
    plans.push(unpartitioned);
  }

  const cookies = [];
  const seen = new Set();
  for (const attributes of plans) {
    let candidates = [];
    try {
      candidates = Services.cookies.getCookiesFromHost(baseDomain, attributes);
    } catch (error) {
      console.warn("DownloadIt: cookie lookup failed", error);
    }
    for (const cookie of candidates) {
      const key = `${cookie.host}\u0001${cookie.path}\u0001${cookie.name}`;
      if (!seen.has(key) && cookieMatchesURI(cookie, uri)) {
        seen.add(key);
        cookies.push(`${cookie.name}=${cookie.value}`);
      }
    }
  }
  return cookies.join("; ");
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

  message(key, ...values) {
    const locale = Services.locale.appLocaleAsBCP47.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en-US";
    let text = MESSAGES[locale][key] || MESSAGES["en-US"][key] || key;
    for (const value of values) {
      text = text.replace("%s", String(value));
    }
    return text;
  }

  async startup() {
    if (Services.appinfo.OS !== "WINNT") {
      throw new Error("DownloadIt currently supports Windows only");
    }

    this.binaryPath = await this.deployBinary();
    Services.obs.addObserver(this, "browser-delayed-startup-finished");

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
      const controller = new DownloadItContextMenuController(this, window);
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
      return new TextDecoder(getManagerOutputEncoding()).decode(bytes);
    }
  }

  async downloadLink(context, manager) {
    if (!this.managers.includes(manager)) {
      throw new Error(`Unsupported download manager: ${manager}`);
    }
    if (!isSupportedURL(context.url)) {
      throw new Error(this.message("unsupported"));
    }

    const uri = Services.io.newURI(context.url);
    const pageReferrerURI = context.downloadPageReferer && isSupportedURL(
      context.downloadPageReferer
    ) ? Services.io.newURI(context.downloadPageReferer) : null;
    const omitCookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false);
    const cookies = omitCookies ? "" : getCookieHeader(uri, context.browser);
    const downloadPageCookies = omitCookies || !pageReferrerURI
      ? ""
      : getCookieHeader(pageReferrerURI, context.browser);
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
