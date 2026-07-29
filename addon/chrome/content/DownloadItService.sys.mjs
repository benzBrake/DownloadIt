import {
  buildDownloadBatchJob,
  classifyDownloadTarget,
  DOWNLOAD_TARGET_CLASSIFICATION,
  isSupportedContextURL,
  parseAvailableManagers,
} from "./DownloadItProtocol.sys.mjs";
import { DownloadItContextMenuController } from "./DownloadItContextMenu.sys.mjs";
import {
  DOWNLOADIT_PANEL_VIEW_ID,
  DOWNLOADIT_TOOLBAR_WIDGET_ID,
  DownloadItPanelViewController,
} from "./DownloadItPanelView.sys.mjs";
import {
  DownloadItDownloadDialogController,
  registerDownloadItHelperAppHook,
  unregisterDownloadItHelperAppHook,
  isDownloadDialogWindow,
} from "./DownloadItDownloadDialog.sys.mjs";
import {
  BUILT_IN_AUTO_CAPTURE_DENY,
  createEmptyAutoCaptureDocument,
  getAutoCaptureDisposition,
  normalizeAutoCaptureDocument,
  stringifyAutoCaptureDocument,
  updateAutoCaptureRule,
} from "./DownloadItAutoCapture.sys.mjs";
import { initializeDownloadItLocalization } from "./DownloadItLocalization.sys.mjs";
import { DownloadItIDMBridge } from "./DownloadItIDMBridge.sys.mjs";
import {
  createDefaultLinkGroupSettings,
  validateLinkGroupSettings,
} from "./DownloadItLinks.sys.mjs";
import { githubMirrorAdapter } from "./DownloadItGitHubMirror.sys.mjs";
import { MirrorAdapterRegistry } from "./DownloadItMirrors.sys.mjs";
import {
  BINARY_SIZE,
  BINARY_SHA256,
} from "./DownloadItBinaryMetadata.sys.mjs";
import {
  getCookieHeader,
  getCookiesForURI,
  getManagerOutputEncoding,
} from "./DownloadItUtils.sys.mjs";
import {
  buildAria2Request,
  buildAria2StartupArguments,
  buildJDownloaderRequest,
  BUILT_IN_PROTOCOLS,
  cloneCustomDownloaderDocument,
  commandTemplateUsesBatch,
  createDownloaderRef,
  createEmptyCustomDownloaderDocument,
  CUSTOM_PROVIDER,
  DownloaderProviderRegistry,
  downloaderRefKey,
  expandCommandTemplate,
  FLASHGOT_PROVIDER,
  getCustomDownloaderCapabilities,
  getFlashGotDownloaderCapabilities,
  getJDownloaderCapabilities,
  getJDownloaderReferer,
  getNativeDownloadFilenameCandidate,
  getNativeDownloaderCapabilities,
  inspectAria2Response,
  isLoopbackAria2URL,
  isNativeDownloadURL,
  JDOWNLOADER_DEFAULT_ENDPOINT,
  JDOWNLOADER_DOWNLOADER_ID,
  JDOWNLOADER_PROVIDER,
  NATIVE_DOWNLOADER_ID,
  NATIVE_PROVIDER,
  normalizeCustomDownloaderDocument,
  normalizeJDownloaderEndpoint,
  normalizeJDownloaderJavaArguments,
  parseJDownloaderDiscoveryResponse,
  parseDownloaderRef,
  redactAria2Secret,
  serializeDownloaderRef,
  stringifyCustomDownloaderDocument,
  validateJDownloaderLaunchPath,
  validateCustomDownloaderDocument,
} from "./DownloadItDownloaders.sys.mjs";

const { classes: Cc, interfaces: Ci } = Components;

const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;
const IOUtils = globalThis.IOUtils;
const PathUtils = globalThis.PathUtils;
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
const { Downloads } = ChromeUtils.importESModule(
  "resource://gre/modules/Downloads.sys.mjs"
);
const { DownloadPaths } = ChromeUtils.importESModule(
  "resource://gre/modules/DownloadPaths.sys.mjs"
);
let customizableUIModule;
try {
  customizableUIModule = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
  );
} catch {
  customizableUIModule = ChromeUtils.importESModule(
    "resource:///modules/CustomizableUI.sys.mjs"
  );
}
const { CustomizableUI } = customizableUIModule;
const {
  clearTimeout: clearTimeoutPromise,
  setTimeout: setTimeoutPromise,
} = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

if (!IOUtils || !PathUtils) {
  throw new Error("DownloadIt requires the Firefox IOUtils and PathUtils globals");
}

const BINARY_RESOURCE = "FlashGot.exe";
const BINARY_NAME = "FlashGot.exe";
const PROFILE_DIRECTORY = "DownloadIt";
const CUSTOM_DOWNLOADERS_FILE = "custom-downloaders.json";
const AUTO_CAPTURE_RULES_FILE = "auto-capture-rules.json";
const PLATFORM_DEFINITIONS = Object.freeze({
  WINNT: Object.freeze({
    id: "windows",
    flashGotSupported: true,
    processWindowHidingSupported: true,
  }),
  Linux: Object.freeze({
    id: "linux",
    flashGotSupported: false,
    processWindowHidingSupported: false,
  }),
});

function getAbsolutePathPlatform(value) {
  const path = String(value || "").trim();
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(path)) {
    return "windows";
  }
  return path.startsWith("/") ? "linux" : "";
}

const PREF_DEFAULT_MANAGER = "downloadit.defaultDM";
const PREF_MANAGER_CACHE = "downloadit.detectedManagers";
const PREF_OMIT_COOKIES = "downloadit.omitCookies";
const PREF_IDM_BRIDGE = "downloadit.idmBridgeEnabled";
const PREF_LINK_GROUPS = "downloadit.linkGroups";
const PREF_MIRRORS = "downloadit.mirrors";
const PREF_DEVELOPER_MODE = "downloadit.developerMode";
const PREF_AUTO_START_TASKS = "downloadit.autoStartTasks";
const PREF_JDOWNLOADER_ENABLED = "downloadit.jdownloader.enabled";
const PREF_JDOWNLOADER_ENDPOINT = "downloadit.jdownloader.endpoint";
const PREF_JDOWNLOADER_LAUNCH_PATH = "downloadit.jdownloader.launchPath";
const PREF_JDOWNLOADER_AUTO_LAUNCH = "downloadit.jdownloader.autoLaunch";
const PREF_JDOWNLOADER_DETECTED_PATH = "downloadit.jdownloader.detectedPath";
const PREF_JDOWNLOADER_DETECTED_JAVA_ARGS =
  "downloadit.jdownloader.detectedJavaArgs";

const JDOWNLOADER_REQUEST_TIMEOUT_MS = 3000;
const JDOWNLOADER_RETRY_DELAY_MS = 8000;
const JDOWNLOADER_MAX_STARTUP_PROBES = 6;

const BROWSER_WINDOW_URL = "chrome://browser/content/browser.xhtml";
const SETTINGS_URL = "chrome://downloadit/content/options.xhtml";
const DOWNLOAD_DIALOG_TOPIC = "domwindowopened";
const APP_LOCALES_CHANGED_TOPIC = "intl:app-locales-changed";
const LINK_COLLECTOR_ACTOR_NAME = "DownloadItLinkCollector";
const LINK_COLLECTOR_ACTOR_URI =
  "chrome://downloadit/content/DownloadItLinkCollectorActor.sys.mjs";
const TOOLBAR_ICON = "chrome://downloadit/content/icons/downloadit.svg";

let activeService = null;
let linkCollectorActorRegistered = false;

function registerLinkCollectorActor() {
  if (linkCollectorActorRegistered) {
    return;
  }
  ChromeUtils.registerWindowActor(LINK_COLLECTOR_ACTOR_NAME, {
    parent: {
      esModuleURI: LINK_COLLECTOR_ACTOR_URI,
    },
    child: {
      esModuleURI: LINK_COLLECTOR_ACTOR_URI,
    },
    allFrames: true,
    matches: ["<all_urls>"],
  });
  linkCollectorActorRegistered = true;
}

function unregisterLinkCollectorActor() {
  if (!linkCollectorActorRegistered) {
    return;
  }
  try {
    ChromeUtils.unregisterWindowActor(LINK_COLLECTOR_ACTOR_NAME);
  } catch (error) {
    console.error("DownloadIt: link collector Actor unregister failed", error);
  }
  linkCollectorActorRegistered = false;
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
    this.platformDefinition = PLATFORM_DEFINITIONS[Services.appinfo.OS] || null;
    this.serviceReady = false;
    this.binaryPath = "";
    this.profileDirectory = PathUtils.join(PathUtils.profileDir, PROFILE_DIRECTORY);
    this.customDownloadersPath = PathUtils.join(
      this.profileDirectory,
      CUSTOM_DOWNLOADERS_FILE,
    );
    this.autoCaptureRulesPath = PathUtils.join(
      this.profileDirectory,
      AUTO_CAPTURE_RULES_FILE,
    );
    this.flashGotManagers = this.loadManagerCache();
    this.customDownloaderDocument = createEmptyCustomDownloaderDocument();
    this.customDownloaderLoadError = null;
    this.autoCaptureRuleDocument = createEmptyAutoCaptureDocument();
    this.autoCaptureRulesLoadError = null;
    this.autoCaptureRulesWritePromise = Promise.resolve();
    this.controllers = new Map();
    this.panelControllers = new Map();
    this.downloadDialogControllers = new Map();
    this.downloadDialogWatchers = new Map();
    this.temporaryFiles = new Set();
    this.refreshPromise = null;
    this.builtInRefreshPromise = null;
    this.aria2StartupPromises = new Map();
    this.jDownloaderOnline = false;
    this.jDownloaderProbePromise = null;
    this.jDownloaderProbeEndpoint = "";
    this.jDownloaderStartupPromise = null;
    this.mirrorRegistry = this.createMirrorRegistry();
    this.providers = this.createProviderRegistry();
    this.idmBridge = new DownloadItIDMBridge(this);
  }

  get defaultManager() {
    return this.defaultDownloader?.key || "";
  }

  set defaultManager(value) {
    const downloader = this.resolveDownloader(value);
    if (!downloader?.available) {
      throw new Error(`Unsupported download manager: ${String(value || "")}`);
    }
    Services.prefs.setStringPref(
      PREF_DEFAULT_MANAGER,
      serializeDownloaderRef(downloader.ref),
    );
  }

  get downloaders() {
    return this.providers.listDownloaders();
  }

  get managers() {
    return this.downloaders.filter(downloader => downloader.available);
  }

  get downloadDialogManagers() {
    return this.managers.filter(
      downloader => downloader.ref.provider !== NATIVE_PROVIDER,
    );
  }

  get configuredDefaultRef() {
    return parseDownloaderRef(
      Services.prefs.getStringPref(PREF_DEFAULT_MANAGER, ""),
    );
  }

  get defaultDownloader() {
    const configured = this.configuredDefaultRef;
    const selected = configured ? this.providers.getDownloader(configured) : null;
    return selected?.available ? selected : this.managers[0] || null;
  }

  createProviderRegistry() {
    return new DownloaderProviderRegistry([
      {
        provider: FLASHGOT_PROVIDER,
        listDownloaders: () => this.listFlashGotDownloaders(),
        getDownloader: id => this.listFlashGotDownloaders().find(
          downloader => downloader.ref.id === id,
        ) || null,
        download: (id, task) => this.downloadViaFlashGot(id, task),
        refresh: options => this.refreshFlashGotManagers(options),
      },
      {
        provider: CUSTOM_PROVIDER,
        listDownloaders: () => this.listCustomDownloaders(),
        getDownloader: id => this.listCustomDownloaders().find(
          downloader => downloader.ref.id === id,
        ) || null,
        download: (id, task) => this.downloadViaCustom(id, task),
      },
      {
        provider: JDOWNLOADER_PROVIDER,
        listDownloaders: () => this.listJDownloaderDownloaders(),
        getDownloader: id => id === JDOWNLOADER_DOWNLOADER_ID
          ? this.listJDownloaderDownloaders()[0] || null
          : null,
        download: (id, task, runtimeContext, options) =>
          this.downloadViaJDownloader(id, task, options),
        refresh: () => this.refreshJDownloader(),
      },
      {
        provider: NATIVE_PROVIDER,
        listDownloaders: () => this.listNativeDownloaders(),
        getDownloader: id => id === NATIVE_DOWNLOADER_ID
          ? this.createNativeDownloaderDescriptor()
          : null,
        download: (id, task, runtimeContext) =>
          this.downloadViaNative(id, task, runtimeContext),
      },
    ]);
  }

  createMirrorRegistry() {
    return new MirrorAdapterRegistry([githubMirrorAdapter]);
  }

  createNativeDownloaderDescriptor() {
    return this.createDownloaderDescriptor({
      ref: createDownloaderRef(NATIVE_PROVIDER, NATIVE_DOWNLOADER_ID),
      name: Services.appinfo.name || "Firefox",
      type: "native",
      custom: false,
      enabled: true,
      available: true,
      unavailableReason: "",
      capabilities: getNativeDownloaderCapabilities(),
    });
  }

  listNativeDownloaders() {
    return [this.createNativeDownloaderDescriptor()];
  }

  createJDownloaderDescriptor(settingsOverride = null) {
    const currentSettings = this.getJDownloaderSettings();
    let sameEndpoint = false;
    if (settingsOverride) {
      try {
        sameEndpoint = normalizeJDownloaderEndpoint(settingsOverride.endpoint) ===
          normalizeJDownloaderEndpoint(currentSettings.endpoint);
      } catch {}
    }
    const settings = settingsOverride
      ? {
          ...currentSettings,
          ...settingsOverride,
          detectedPath: sameEndpoint
            ? currentSettings.detectedPath
            : "",
          detectedJavaArgs: sameEndpoint
            ? currentSettings.detectedJavaArgs
            : [],
        }
      : currentSettings;
    let available = false;
    let unavailableReason = settings.enabled ? "" : "disabled";
    try {
      const normalized = this.normalizeJDownloaderSettings(settings, {
        requireExistingPath: false,
      });
      const launchPathPlatform = getAbsolutePathPlatform(normalized.launchPath);
      if (
        launchPathPlatform &&
        launchPathPlatform !== this.platformDefinition?.id
      ) {
        unavailableReason = "platform-path";
      } else {
        available = normalized.enabled;
      }
    } catch (error) {
      unavailableReason = error?.code || "unavailable";
    }
    return this.createDownloaderDescriptor({
      ref: createDownloaderRef(
        JDOWNLOADER_PROVIDER,
        JDOWNLOADER_DOWNLOADER_ID,
      ),
      name: "JDownloader",
      type: "jdownloader",
      custom: false,
      enabled: Boolean(settings.enabled),
      available,
      unavailableReason: available ? "" : unavailableReason || "unavailable",
      capabilities: getJDownloaderCapabilities(),
    });
  }

  listJDownloaderDownloaders() {
    const downloader = this.createJDownloaderDescriptor();
    return downloader.enabled ? [downloader] : [];
  }

  listFlashGotDownloaders() {
    if (!this.platformDefinition?.flashGotSupported) {
      return [];
    }
    return this.flashGotManagers.map(name => this.createDownloaderDescriptor({
      ref: createDownloaderRef(FLASHGOT_PROVIDER, name),
      name,
      type: "flashgot",
      custom: false,
      enabled: true,
      available: true,
      unavailableReason: "",
      capabilities: getFlashGotDownloaderCapabilities(name),
    }));
  }

  listCustomDownloaders(document = this.customDownloaderDocument) {
    return document.downloaders.map(configuration => {
      let unavailableReason = "";
      if (!configuration.enabled) {
        unavailableReason = "disabled";
      } else {
        try {
          validateCustomDownloaderDocument({
            version: document.version,
            downloaders: [configuration],
          });
        } catch (error) {
          unavailableReason = error.code || "invalid-configuration";
        }
      }
      if (!unavailableReason && configuration.type === "command") {
        if (!this.isLocalExecutable(configuration.command.executablePath)) {
          unavailableReason = "executable-not-found";
        }
      } else if (!unavailableReason && configuration.type === "aria2") {
        if (
          configuration.aria2.autoStart &&
          !this.isLocalExecutable(configuration.aria2.executablePath)
        ) {
          unavailableReason = "executable-not-found";
        } else if (
          configuration.aria2.autoStart &&
          configuration.aria2.configurationPath &&
          !this.isLocalFile(configuration.aria2.configurationPath)
        ) {
          unavailableReason = "configuration-not-found";
        }
      }
      return this.createDownloaderDescriptor({
        ref: createDownloaderRef(CUSTOM_PROVIDER, configuration.id),
        name: configuration.name,
        type: configuration.type,
        custom: true,
        enabled: configuration.enabled,
        available: !unavailableReason,
        unavailableReason,
        configuration,
        capabilities: getCustomDownloaderCapabilities(configuration),
      });
    });
  }

  createDownloaderDescriptor(value) {
    return {
      ...value,
      key: downloaderRefKey(value.ref),
    };
  }

  resolveDownloader(value, customDocument = null) {
    if (!value) {
      return null;
    }
    let ref = null;
    if (typeof value === "object") {
      ref = value.ref || value;
    } else {
      ref = parseDownloaderRef(value);
    }
    if (!ref) {
      return null;
    }
    if (customDocument && ref.provider === CUSTOM_PROVIDER) {
      return this.listCustomDownloaders(customDocument).find(
        downloader => downloader.ref.id === ref.id,
      ) || null;
    }
    return this.providers.getDownloader(ref);
  }

  isLocalFile(path) {
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(this.resolveExecutablePath(path));
      return file.exists() && file.isFile();
    } catch {
      return false;
    }
  }

  getConfigurationDirectoryFile() {
    return Services.dirsvc.get("UChrm", Ci.nsIFile);
  }

  resolveExecutablePath(value) {
    return this.resolveCustomFilePath(value);
  }

  resolveCustomFilePath(value) {
    const path = String(value || "").trim();
    if (!path || getAbsolutePathPlatform(path)) {
      return path;
    }
    const configurationDirectory = this.getConfigurationDirectoryFile();
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.setRelativePath(configurationDirectory, path.replace(/\\/g, "/"));
    if (!configurationDirectory.contains(file)) {
      throw new DownloadItError("executable-relative-path-invalid");
    }
    return file.path;
  }

  normalizeExecutablePathForStorage(value) {
    return this.normalizeCustomFilePathForStorage(value);
  }

  normalizeCustomFilePathForStorage(value) {
    if (!value) {
      return "";
    }
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    if (typeof value === "string") {
      const path = this.resolveCustomFilePath(value);
      const pathPlatform = getAbsolutePathPlatform(path);
      if (pathPlatform && pathPlatform !== this.platformDefinition?.id) {
        return path;
      }
      file.initWithPath(path);
    } else {
      file.initWithFile(value.QueryInterface(Ci.nsIFile));
    }
    const configurationDirectory = this.getConfigurationDirectoryFile();
    if (configurationDirectory.contains(file)) {
      return file.getRelativePath(configurationDirectory).replace(/\\/g, "/");
    }
    return file.path;
  }

  normalizeCustomDownloaderFilePaths(document) {
    const normalized = cloneCustomDownloaderDocument(document);
    for (const downloader of normalized.downloaders) {
      const configuration = downloader[downloader.type];
      if (configuration?.executablePath) {
        configuration.executablePath = this.normalizeCustomFilePathForStorage(
          configuration.executablePath,
        );
      }
      if (configuration?.configurationPath) {
        configuration.configurationPath = this.normalizeCustomFilePathForStorage(
          configuration.configurationPath,
        );
      }
    }
    return normalized;
  }

  createCustomDownloaderId() {
    return Services.uuid.generateUUID().toString().replace(/[{}]/g, "").toLowerCase();
  }

  async reloadCustomDownloaders() {
    try {
      const raw = await IOUtils.readUTF8(this.customDownloadersPath);
      this.customDownloaderDocument = normalizeCustomDownloaderDocument(
        JSON.parse(raw.replace(/^\uFEFF/, "")),
      );
      this.customDownloaderLoadError = null;
    } catch (error) {
      if (error?.name === "NotFoundError") {
        this.customDownloaderDocument = createEmptyCustomDownloaderDocument();
        this.customDownloaderLoadError = null;
      } else {
        this.customDownloaderLoadError = error;
      }
    }
    return this.readSettings();
  }

  async resetCustomDownloaders() {
    const document = createEmptyCustomDownloaderDocument();
    const resetConfiguredDefault = this.configuredDefaultRef?.provider ===
      CUSTOM_PROVIDER;
    await this.writeCustomDownloaders(document);
    this.customDownloaderDocument = document;
    this.customDownloaderLoadError = null;
    if (
      resetConfiguredDefault &&
      !Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER)
    ) {
      const fallback = this.managers[0] || null;
      if (fallback) {
        Services.prefs.setStringPref(
          PREF_DEFAULT_MANAGER,
          serializeDownloaderRef(fallback.ref),
        );
      } else {
        Services.prefs.clearUserPref(PREF_DEFAULT_MANAGER);
      }
    }
    return this.readSettings();
  }

  async writeCustomDownloaders(document) {
    const serialized = stringifyCustomDownloaderDocument(document);
    await IOUtils.makeDirectory(this.profileDirectory, { ignoreExisting: true });
    const temporaryId = Services.uuid.generateUUID().toString().replace(/[{}-]/g, "");
    const temporaryPath = `${this.customDownloadersPath}.${temporaryId}.tmp`;
    await IOUtils.remove(temporaryPath, { ignoreAbsent: true });
    try {
      await IOUtils.writeUTF8(
        this.customDownloadersPath,
        serialized,
        { tmpPath: temporaryPath },
      );
    } finally {
      await IOUtils.remove(temporaryPath, { ignoreAbsent: true });
    }
  }

  isLocalExecutable(path) {
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(this.resolveExecutablePath(path));
      if (!file.exists() || !file.isFile()) {
        return false;
      }
      return this.platformDefinition?.id === "linux"
        ? file.isExecutable()
        : true;
    } catch {
      return false;
    }
  }

  async reloadAutoCaptureRules() {
    await this.autoCaptureRulesWritePromise;
    try {
      const raw = await IOUtils.readUTF8(this.autoCaptureRulesPath);
      this.autoCaptureRuleDocument = normalizeAutoCaptureDocument(
        JSON.parse(raw.replace(/^\uFEFF/, "")),
      );
      this.autoCaptureRulesLoadError = null;
    } catch (error) {
      this.autoCaptureRuleDocument = createEmptyAutoCaptureDocument();
      if (error?.name === "NotFoundError") {
        this.autoCaptureRulesLoadError = null;
      } else {
        this.autoCaptureRulesLoadError = error;
      }
    }
    return this.readSettings();
  }

  async resetAutoCaptureRules() {
    const document = createEmptyAutoCaptureDocument();
    await this.enqueueAutoCaptureRulesUpdate(() => document);
    return this.readSettings();
  }

  async writeAutoCaptureRules(document) {
    const serialized = stringifyAutoCaptureDocument(document);
    await IOUtils.makeDirectory(this.profileDirectory, { ignoreExisting: true });
    const temporaryId = Services.uuid.generateUUID().toString().replace(/[{}-]/g, "");
    const temporaryPath = `${this.autoCaptureRulesPath}.${temporaryId}.tmp`;
    await IOUtils.remove(temporaryPath, { ignoreAbsent: true });
    try {
      await IOUtils.writeUTF8(
        this.autoCaptureRulesPath,
        serialized,
        { tmpPath: temporaryPath },
      );
    } finally {
      await IOUtils.remove(temporaryPath, { ignoreAbsent: true });
    }
  }

  enqueueAutoCaptureRulesUpdate(transform) {
    const operation = this.autoCaptureRulesWritePromise.then(async () => {
      const document = normalizeAutoCaptureDocument(
        transform(this.autoCaptureRuleDocument),
      );
      await this.writeAutoCaptureRules(document);
      this.autoCaptureRuleDocument = document;
      this.autoCaptureRulesLoadError = null;
      return normalizeAutoCaptureDocument(document);
    });
    this.autoCaptureRulesWritePromise = operation.catch(() => {});
    return operation;
  }

  getJDownloaderSettings() {
    let detectedJavaArgs = [];
    try {
      detectedJavaArgs = normalizeJDownloaderJavaArguments(JSON.parse(
        Services.prefs.getStringPref(
          PREF_JDOWNLOADER_DETECTED_JAVA_ARGS,
          "[]",
        ),
      ));
    } catch {}
    return {
      enabled: this.isJDownloaderEnabled(),
      endpoint: Services.prefs.getStringPref(
        PREF_JDOWNLOADER_ENDPOINT,
        JDOWNLOADER_DEFAULT_ENDPOINT,
      ),
      launchPath: Services.prefs.getStringPref(
        PREF_JDOWNLOADER_LAUNCH_PATH,
        "",
      ),
      autoLaunch: Services.prefs.getBoolPref(
        PREF_JDOWNLOADER_AUTO_LAUNCH,
        true,
      ),
      detectedPath: Services.prefs.getStringPref(
        PREF_JDOWNLOADER_DETECTED_PATH,
        "",
      ),
      detectedJavaArgs,
      online: this.jDownloaderOnline,
    };
  }

  getJDownloaderLocks() {
    return {
      enabled: Services.prefs.prefIsLocked(PREF_JDOWNLOADER_ENABLED),
      endpoint: Services.prefs.prefIsLocked(PREF_JDOWNLOADER_ENDPOINT),
      launchPath: Services.prefs.prefIsLocked(PREF_JDOWNLOADER_LAUNCH_PATH),
      autoLaunch: Services.prefs.prefIsLocked(PREF_JDOWNLOADER_AUTO_LAUNCH),
    };
  }

  isJDownloaderEnabled() {
    if (
      Services.prefs.prefHasUserValue(PREF_JDOWNLOADER_ENABLED) ||
      Services.prefs.prefIsLocked(PREF_JDOWNLOADER_ENABLED)
    ) {
      return Services.prefs.getBoolPref(PREF_JDOWNLOADER_ENABLED, false);
    }
    if (this.configuredDefaultRef?.provider === JDOWNLOADER_PROVIDER) {
      return true;
    }
    return [
      PREF_JDOWNLOADER_ENDPOINT,
      PREF_JDOWNLOADER_LAUNCH_PATH,
      PREF_JDOWNLOADER_AUTO_LAUNCH,
      PREF_JDOWNLOADER_DETECTED_PATH,
      PREF_JDOWNLOADER_DETECTED_JAVA_ARGS,
    ].some(preference => Services.prefs.prefHasUserValue(preference));
  }

  getBuiltInProtocols() {
    return BUILT_IN_PROTOCOLS.map(protocol => {
      if (protocol.id !== JDOWNLOADER_PROVIDER) {
        throw new Error(`Unsupported built-in protocol: ${protocol.id}`);
      }
      return {
        ...protocol,
        ref: createDownloaderRef(protocol.provider, protocol.downloaderId),
        settings: this.getJDownloaderSettings(),
        locks: this.getJDownloaderLocks(),
      };
    });
  }

  normalizeJDownloaderSettings(value = {}, { requireExistingPath = true } = {}) {
    const endpoint = normalizeJDownloaderEndpoint(value.endpoint);
    const launchPath = validateJDownloaderLaunchPath(
      value.launchPath,
      this.platformDefinition?.id || "windows",
    );
    const launchPathPlatform = getAbsolutePathPlatform(launchPath);
    if (
      launchPath &&
      (
        !launchPathPlatform ||
        (
          requireExistingPath &&
          launchPathPlatform === this.platformDefinition?.id &&
          (
            /\.jar$/i.test(launchPath)
              ? !this.isLocalFile(launchPath)
              : !this.isLocalExecutable(launchPath)
          )
        )
      )
    ) {
      throw new DownloadItError("jdownloader-launch-path-invalid");
    }
    return {
      enabled: value.enabled !== false,
      endpoint,
      launchPath,
      autoLaunch: value.autoLaunch !== false,
    };
  }

  clearJDownloaderDiscovery() {
    if (
      !Services.prefs.prefIsLocked(PREF_JDOWNLOADER_DETECTED_PATH) &&
      Services.prefs.prefHasUserValue(PREF_JDOWNLOADER_DETECTED_PATH)
    ) {
      Services.prefs.clearUserPref(PREF_JDOWNLOADER_DETECTED_PATH);
    }
    if (
      !Services.prefs.prefIsLocked(PREF_JDOWNLOADER_DETECTED_JAVA_ARGS) &&
      Services.prefs.prefHasUserValue(PREF_JDOWNLOADER_DETECTED_JAVA_ARGS)
    ) {
      Services.prefs.clearUserPref(PREF_JDOWNLOADER_DETECTED_JAVA_ARGS);
    }
  }

  clearJDownloaderConfiguration() {
    for (const preference of [
      PREF_JDOWNLOADER_ENDPOINT,
      PREF_JDOWNLOADER_LAUNCH_PATH,
      PREF_JDOWNLOADER_AUTO_LAUNCH,
    ]) {
      if (
        !Services.prefs.prefIsLocked(preference) &&
        Services.prefs.prefHasUserValue(preference)
      ) {
        Services.prefs.clearUserPref(preference);
      }
    }
    this.clearJDownloaderDiscovery();
    this.jDownloaderOnline = false;
  }

  storeJDownloaderDiscovery(discovery) {
    if (!Services.prefs.prefIsLocked(PREF_JDOWNLOADER_DETECTED_PATH)) {
      Services.prefs.setStringPref(
        PREF_JDOWNLOADER_DETECTED_PATH,
        discovery.path,
      );
    }
    if (!Services.prefs.prefIsLocked(PREF_JDOWNLOADER_DETECTED_JAVA_ARGS)) {
      Services.prefs.setStringPref(
        PREF_JDOWNLOADER_DETECTED_JAVA_ARGS,
        JSON.stringify(discovery.javaArguments),
      );
    }
  }

  getLocalFile(path) {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    return file;
  }

  existingLocalPath(path) {
    try {
      const file = this.getLocalFile(path);
      return file.exists() && file.isFile() ? file.path : "";
    } catch {
      return "";
    }
  }

  readRegisteredJavaHomes() {
    if (!("@mozilla.org/windows-registry-key;1" in Cc)) {
      return [];
    }
    const homes = [];
    const paths = [
      "SOFTWARE\\JavaSoft\\Java Runtime Environment",
      "SOFTWARE\\JavaSoft\\JRE",
      "SOFTWARE\\JavaSoft\\Java Development Kit",
      "SOFTWARE\\JavaSoft\\JDK",
      "SOFTWARE\\WOW6432Node\\JavaSoft\\Java Runtime Environment",
      "SOFTWARE\\WOW6432Node\\JavaSoft\\JRE",
      "SOFTWARE\\WOW6432Node\\JavaSoft\\Java Development Kit",
      "SOFTWARE\\WOW6432Node\\JavaSoft\\JDK",
    ];
    const template = Cc["@mozilla.org/windows-registry-key;1"]
      .createInstance(Ci.nsIWindowsRegKey);
    const roots = [
      template.ROOT_KEY_CURRENT_USER,
      template.ROOT_KEY_LOCAL_MACHINE,
    ];
    for (const root of roots) {
      for (const registryPath of paths) {
        let key = null;
        let child = null;
        try {
          key = Cc["@mozilla.org/windows-registry-key;1"]
            .createInstance(Ci.nsIWindowsRegKey);
          key.open(root, registryPath, key.ACCESS_READ);
          const version = key.readStringValue("CurrentVersion");
          child = key.openChild(version, key.ACCESS_READ);
          const home = child.readStringValue("JavaHome");
          if (home) {
            homes.push(home);
          }
        } catch {} finally {
          try {
            child?.close();
          } catch {}
          try {
            key?.close();
          } catch {}
        }
      }
    }
    return homes;
  }

  resolveJDownloaderJarLaunch(jarPath, javaArguments = []) {
    const jar = this.getLocalFile(jarPath);
    const directory = jar.parent;
    const executableNames = this.platformDefinition?.id === "linux"
      ? ["JDownloader2", "JDownloader"]
      : [
          jar.leafName.replace(/\.jar$/i, ".exe"),
          "JDownloader2.exe",
          "JDownloader 2.exe",
          "JDownloader.exe",
        ];
    const seen = new Set();
    for (const name of executableNames) {
      const normalizedName = name.toLowerCase();
      if (seen.has(normalizedName)) {
        continue;
      }
      seen.add(normalizedName);
      const candidate = directory.clone();
      candidate.append(name);
      const executablePath = this.existingExecutablePath(candidate.path);
      if (executablePath) {
        return { executablePath, argumentsList: [] };
      }
    }

    const javaDirectories = [
      PathUtils.join(directory.path, "jre", "bin"),
      PathUtils.join(directory.path, "runtime", "bin"),
      PathUtils.join(directory.path, "runtime", "jre", "bin"),
    ];
    const javaHome = Services.env.get("JAVA_HOME");
    if (javaHome) {
      javaDirectories.push(PathUtils.join(javaHome, "bin"));
    }
    if (this.platformDefinition?.id === "windows") {
      javaDirectories.push(...this.readRegisteredJavaHomes().map(home =>
        PathUtils.join(home, "bin")
      ));
      try {
        javaDirectories.push(Services.dirsvc.get("SysD", Ci.nsIFile).path);
      } catch {}
    } else if (this.platformDefinition?.id === "linux") {
      javaDirectories.push(...Services.env.get("PATH").split(":").filter(Boolean));
    }

    for (const javaDirectory of javaDirectories) {
      const executableNames = this.platformDefinition?.id === "linux"
        ? ["java"]
        : ["javaw.exe", "java.exe"];
      for (const name of executableNames) {
        const executablePath = this.existingExecutablePath(
          PathUtils.join(javaDirectory, name),
        );
        if (executablePath) {
          return {
            executablePath,
            argumentsList: [
              ...normalizeJDownloaderJavaArguments(javaArguments),
              "-jar",
              jar.path,
            ],
          };
        }
      }
    }
    return null;
  }

  resolveJDownloaderLaunch(
    settings = this.getJDownloaderSettings(),
    { clearInvalidCache = true } = {},
  ) {
    const platform = this.platformDefinition?.id || "windows";
    const manualPath = validateJDownloaderLaunchPath(settings.launchPath, platform);
    let path = manualPath || validateJDownloaderLaunchPath(settings.detectedPath, platform);
    if (!path) {
      return null;
    }
    const pathPlatform = getAbsolutePathPlatform(path);
    if (pathPlatform && pathPlatform !== platform) {
      if (manualPath) {
        throw new DownloadItError("jdownloader-launch-path-invalid");
      }
      return null;
    }
    const existingPath = pathPlatform
      ? /\.jar$/i.test(path)
        ? this.existingLocalPath(path)
        : this.existingExecutablePath(path)
      : "";
    if (!existingPath) {
      if (manualPath) {
        throw new DownloadItError("jdownloader-launch-path-invalid");
      }
      if (clearInvalidCache) {
        this.clearJDownloaderDiscovery();
      }
      return null;
    }
    if (!/\.jar$/i.test(existingPath)) {
      return { executablePath: existingPath, argumentsList: [] };
    }
    return this.resolveJDownloaderJarLaunch(
      existingPath,
      settings.detectedJavaArgs,
    );
  }

  async testJDownloaderConfiguration({ endpoint } = {}) {
    return this.probeJDownloader({
      endpoint,
      persist: false,
      updateState: false,
    });
  }

  async testAria2Configuration(config) {
    validateCustomDownloaderDocument({
      version: 1,
      downloaders: [{
        id: "00000000-0000-4000-8000-000000000000",
        name: "aria2",
        enabled: true,
        type: "aria2",
        aria2: config,
      }],
    });
    const payload = {
      jsonrpc: "2.0",
      id: `downloadit-test-${Date.now()}`,
      method: "aria2.getVersion",
      params: config.secret ? [`token:${config.secret}`] : [],
    };
    const response = await this.sendAria2Request(config, payload);
    if (response.error) {
      throw new DownloadItError("aria2-rpc-error", {
        error: redactAria2Secret(
          response.error.message || response.error.code || "",
          config.secret,
        ),
      });
    }
    return response.result || {};
  }

  get autoCaptureRules() {
    return normalizeAutoCaptureDocument(
      this.autoCaptureRuleDocument || createEmptyAutoCaptureDocument(),
    );
  }

  existingExecutablePath(path) {
    try {
      const file = this.getLocalFile(path);
      if (!file.exists() || !file.isFile()) {
        return "";
      }
      if (this.platformDefinition?.id === "linux" && !file.isExecutable()) {
        return "";
      }
      return file.path;
    } catch {
      return "";
    }
  }

  get linkGroups() {
    try {
      const fallback = createDefaultLinkGroupSettings();
      const raw = Services.prefs.getStringPref(PREF_LINK_GROUPS, "");
      return raw ? validateLinkGroupSettings(JSON.parse(raw)) : fallback;
    } catch (error) {
      console.error("DownloadIt: invalid link group preference", error);
      return createDefaultLinkGroupSettings();
    }
  }

  get linkGroupsLocked() {
    return Services.prefs.prefIsLocked(PREF_LINK_GROUPS);
  }

  get mirrorSettings() {
    const fallback = this.mirrorRegistry.createDefaultSettings();
    try {
      const raw = Services.prefs.getStringPref(PREF_MIRRORS, "");
      return raw
        ? this.mirrorRegistry.validateSettings(JSON.parse(raw))
        : fallback;
    } catch (error) {
      console.error("DownloadIt: invalid mirror preference", error);
      return fallback;
    }
  }

  get mirrorSettingsLocked() {
    return Services.prefs.prefIsLocked(PREF_MIRRORS);
  }

  validateMirrorSettings(value) {
    return this.mirrorRegistry.validateSettings(value);
  }

  get developerMode() {
    return Services.prefs.getBoolPref(PREF_DEVELOPER_MODE, false);
  }

  activateDeveloperMode() {
    if (!Services.prefs.prefIsLocked(PREF_DEVELOPER_MODE)) {
      Services.prefs.setBoolPref(PREF_DEVELOPER_MODE, true);
    }
    return this.developerMode;
  }

  hasAutoExtension(value) {
    return this.getAutoCaptureDisposition(value) === "allow";
  }

  getAutoCaptureDisposition(value) {
    return getAutoCaptureDisposition(this.autoCaptureRules, value);
  }

  createAutoCaptureRuleId() {
    return Services.uuid.generateUUID().toString().replace(/[{}]/g, "").toLowerCase();
  }

  async setAutoCaptureRule(value, disposition) {
    if (this.autoCaptureRulesLoadError) {
      throw new DownloadItError("auto-capture-config-blocked");
    }
    return this.enqueueAutoCaptureRulesUpdate(current => updateAutoCaptureRule(
      current,
      value,
      disposition,
      this.createAutoCaptureRuleId(),
    ));
  }

  readSettings() {
    const configuredDefaultManager = this.configuredDefaultRef;
    const managers = this.managers.map(downloader => ({ ...downloader }));
    return {
      downloaders: this.downloaders.map(downloader => ({ ...downloader })),
      managers,
      configuredDefaultManager,
      defaultManager: this.defaultManager,
      defaultDownloader: this.defaultDownloader
        ? { ...this.defaultDownloader }
        : null,
      detectedManagerCount: this.downloaders.filter(downloader =>
        downloader.ref.provider === FLASHGOT_PROVIDER &&
        downloader.available
      ).length,
      availableManagerCount: managers.length,
      customDownloaders: cloneCustomDownloaderDocument(
        this.customDownloaderDocument,
      ),
      customDownloadersPath: this.customDownloadersPath,
      customDownloadersError: this.customDownloaderLoadError
        ? {
            code: this.customDownloaderLoadError.code || "read-failed",
            message: this.customDownloaderLoadError.message ||
              String(this.customDownloaderLoadError),
            args: this.customDownloaderLoadError.args || {},
          }
        : null,
      omitCookies: Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false),
      autoStartTasks: Services.prefs.getBoolPref(PREF_AUTO_START_TASKS, true),
      builtInProtocols: this.getBuiltInProtocols(),
      jdownloader: this.getJDownloaderSettings(),
      jdownloaderLocked: this.getJDownloaderLocks(),
      idmBridgeEnabled: Services.prefs.getBoolPref(
        PREF_IDM_BRIDGE,
        false,
      ),
      idmBridgeActive: this.idmBridge.running,
      autoCaptureRules: this.autoCaptureRules,
      builtInAutoCaptureDeny: BUILT_IN_AUTO_CAPTURE_DENY.map(rule => ({
        ...rule,
      })),
      autoCaptureRulesPath: this.autoCaptureRulesPath,
      autoCaptureRulesError: this.autoCaptureRulesLoadError
        ? {
            code: this.autoCaptureRulesLoadError.code || "read-failed",
            message: this.autoCaptureRulesLoadError.message ||
              String(this.autoCaptureRulesLoadError),
            args: this.autoCaptureRulesLoadError.args || {},
          }
        : null,
      linkGroups: this.linkGroups,
      mirrorAdapters: this.mirrorRegistry.adapters.map(adapter => ({
        id: adapter.id,
        nameL10nId: adapter.nameL10nId,
        descriptionL10nId: adapter.descriptionL10nId,
      })),
      mirrorSettings: this.mirrorSettings,
      developerMode: this.developerMode,
      defaultManagerLocked: Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER),
      omitCookiesLocked: Services.prefs.prefIsLocked(PREF_OMIT_COOKIES),
      autoStartTasksLocked: Services.prefs.prefIsLocked(PREF_AUTO_START_TASKS),
      idmBridgeLocked: Services.prefs.prefIsLocked(PREF_IDM_BRIDGE),
      linkGroupsLocked: this.linkGroupsLocked,
      mirrorSettingsLocked: this.mirrorSettingsLocked,
      binaryPath: this.binaryPath,
      serviceReady: this.serviceReady,
      platformSupported: Boolean(this.platformDefinition),
      platform: this.platformDefinition?.id || "unsupported",
      flashGotSupported: Boolean(this.platformDefinition?.flashGotSupported),
      processWindowHidingSupported: Boolean(
        this.platformDefinition?.processWindowHidingSupported,
      ),
    };
  }

  async applySettings({
    defaultManager = null,
    omitCookies = false,
    autoStartTasks = null,
    builtInProtocols = null,
    jdownloader = null,
    idmBridgeEnabled = null,
    autoCaptureRules = null,
    linkGroups = null,
    mirrorSettings = null,
    customDownloaders = null,
  } = {}) {
    const defaultManagerRequested = defaultManager !== null &&
      defaultManager !== undefined;
    const manager = defaultManagerRequested ? String(defaultManager || "") : "";
    const currentAutoCaptureRules = this.autoCaptureRules;
    const requestedAutoCaptureRules = autoCaptureRules == null
      ? currentAutoCaptureRules
      : normalizeAutoCaptureDocument(autoCaptureRules);
    const currentLinkGroups = this.linkGroups;
    const requestedLinkGroups = linkGroups == null
      ? currentLinkGroups
      : validateLinkGroupSettings(linkGroups);
    const currentMirrorSettings = this.mirrorSettings;
    const requestedMirrorSettings = mirrorSettings == null
      ? currentMirrorSettings
      : this.validateMirrorSettings(mirrorSettings);
    const configuredDefaultRef = this.configuredDefaultRef;
    const configuredDefaultKey = configuredDefaultRef
      ? downloaderRefKey(configuredDefaultRef)
      : "";
    const currentOmitCookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false);
    const currentAutoStartTasks = Services.prefs.getBoolPref(
      PREF_AUTO_START_TASKS,
      true,
    );
    const requestedAutoStartTasks = autoStartTasks == null
      ? currentAutoStartTasks
      : Boolean(autoStartTasks);
    const currentJDownloader = this.getJDownloaderSettings();
    const builtInJDownloader = builtInProtocols &&
      typeof builtInProtocols === "object" &&
      !Array.isArray(builtInProtocols)
      ? builtInProtocols[JDOWNLOADER_PROVIDER]
      : null;
    const requestedJDownloaderInput = builtInJDownloader ?? jdownloader;
    const requestedJDownloader = requestedJDownloaderInput == null
      ? {
          enabled: currentJDownloader.enabled,
          endpoint: currentJDownloader.endpoint,
          launchPath: currentJDownloader.launchPath,
          autoLaunch: currentJDownloader.autoLaunch,
        }
      : requestedJDownloaderInput.enabled === false
        ? {
            enabled: false,
            endpoint: currentJDownloader.endpoint,
            launchPath: currentJDownloader.launchPath,
            autoLaunch: currentJDownloader.autoLaunch,
          }
        : this.normalizeJDownloaderSettings(requestedJDownloaderInput);
    const currentIDMBridgeEnabled = Services.prefs.getBoolPref(
      PREF_IDM_BRIDGE,
      false,
    );
    const requestedIDMBridgeEnabled = idmBridgeEnabled == null
      ? currentIDMBridgeEnabled
      : Boolean(idmBridgeEnabled);

    let requestedCustomDownloaders = customDownloaders == null
      ? null
      : validateCustomDownloaderDocument(customDownloaders);
    if (requestedCustomDownloaders && this.customDownloaderLoadError) {
      throw new DownloadItError("custom-config-blocked");
    }
    if (autoCaptureRules != null && this.autoCaptureRulesLoadError) {
      throw new DownloadItError("auto-capture-config-blocked");
    }
    const customDownloaderInputChanged = requestedCustomDownloaders !== null &&
      JSON.stringify(requestedCustomDownloaders) !==
        JSON.stringify(this.customDownloaderDocument);
    if (customDownloaderInputChanged) {
      requestedCustomDownloaders = validateCustomDownloaderDocument(
        this.normalizeCustomDownloaderFilePaths(requestedCustomDownloaders),
      );
    }
    const customDownloadersChanged = requestedCustomDownloaders !== null &&
      JSON.stringify(requestedCustomDownloaders) !==
        JSON.stringify(this.customDownloaderDocument);
    const effectiveCustomDownloaders = requestedCustomDownloaders ||
      this.customDownloaderDocument;
    const requestedRef = manager ? parseDownloaderRef(manager) : null;
    const requestedDownloader = requestedRef?.provider === JDOWNLOADER_PROVIDER
      ? this.createJDownloaderDescriptor(requestedJDownloader)
      : manager
        ? this.resolveDownloader(manager, requestedCustomDownloaders)
        : null;
    if (defaultManagerRequested && manager && !requestedDownloader?.available) {
      throw new Error(`Unsupported download manager: ${manager}`);
    }
    const configuredCustomEntry = configuredDefaultRef?.provider === CUSTOM_PROVIDER
      ? effectiveCustomDownloaders.downloaders.find(
          downloader => downloader.id === configuredDefaultRef.id,
        )
      : null;
    const configuredCustomInvalidated = customDownloadersChanged &&
      configuredDefaultRef?.provider === CUSTOM_PROVIDER &&
      (!configuredCustomEntry || !configuredCustomEntry.enabled);
    const configuredJDownloaderInvalidated =
      configuredDefaultRef?.provider === JDOWNLOADER_PROVIDER &&
      !requestedJDownloader.enabled;
    const defaultManagerLocked = Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER);
    if (
      defaultManagerLocked &&
      (
        (defaultManagerRequested && manager !== configuredDefaultKey) ||
        configuredCustomInvalidated ||
        configuredJDownloaderInvalidated
      )
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
      Services.prefs.prefIsLocked(PREF_AUTO_START_TASKS) &&
      requestedAutoStartTasks !== currentAutoStartTasks
    ) {
      throw new Error("The task start preference is locked");
    }
    const jDownloaderLocks = this.getJDownloaderLocks();
    for (const key of ["enabled", "endpoint", "launchPath", "autoLaunch"]) {
      if (jDownloaderLocks[key] && requestedJDownloader[key] !== currentJDownloader[key]) {
        throw new Error(`The JDownloader ${key} preference is locked`);
      }
    }
    if (
      Services.prefs.prefIsLocked(PREF_IDM_BRIDGE) &&
      requestedIDMBridgeEnabled !== currentIDMBridgeEnabled
    ) {
      throw new Error("The IDM bridge preference is locked");
    }
    if (
      this.linkGroupsLocked &&
      JSON.stringify(requestedLinkGroups) !== JSON.stringify(currentLinkGroups)
    ) {
      throw new Error("The link group preference is locked");
    }
    if (
      this.mirrorSettingsLocked &&
      JSON.stringify(requestedMirrorSettings) !==
        JSON.stringify(currentMirrorSettings)
    ) {
      throw new Error("The mirror preference is locked");
    }

    if (customDownloadersChanged) {
      await this.writeCustomDownloaders(requestedCustomDownloaders);
      this.customDownloaderDocument = requestedCustomDownloaders;
      this.customDownloaderLoadError = null;
    }
    if (!defaultManagerLocked) {
      let nextDefault = null;
      let updateDefault = false;
      if (defaultManagerRequested) {
        nextDefault = requestedDownloader;
        updateDefault = manager !== configuredDefaultKey;
      } else if (configuredCustomInvalidated || configuredJDownloaderInvalidated) {
        nextDefault = [
          ...this.listFlashGotDownloaders(),
          ...this.listCustomDownloaders(effectiveCustomDownloaders),
          ...(requestedJDownloader.enabled
            ? [this.createJDownloaderDescriptor(requestedJDownloader)]
            : []),
          ...this.listNativeDownloaders(),
        ].find(downloader => downloader.available) || null;
        updateDefault = true;
      }
      if (updateDefault) {
        if (nextDefault) {
          Services.prefs.setStringPref(
            PREF_DEFAULT_MANAGER,
            serializeDownloaderRef(nextDefault.ref),
          );
        } else {
          Services.prefs.clearUserPref(PREF_DEFAULT_MANAGER);
        }
      }
    }
    if (Boolean(omitCookies) !== currentOmitCookies) {
      Services.prefs.setBoolPref(PREF_OMIT_COOKIES, Boolean(omitCookies));
    }
    if (requestedAutoStartTasks !== currentAutoStartTasks) {
      Services.prefs.setBoolPref(PREF_AUTO_START_TASKS, requestedAutoStartTasks);
    }
    if (requestedJDownloader.enabled !== currentJDownloader.enabled) {
      Services.prefs.setBoolPref(
        PREF_JDOWNLOADER_ENABLED,
        requestedJDownloader.enabled,
      );
    }
    if (!requestedJDownloader.enabled) {
      if (currentJDownloader.enabled) {
        this.clearJDownloaderConfiguration();
      }
    } else {
      if (requestedJDownloader.endpoint !== currentJDownloader.endpoint) {
        Services.prefs.setStringPref(
          PREF_JDOWNLOADER_ENDPOINT,
          requestedJDownloader.endpoint,
        );
        this.clearJDownloaderDiscovery();
        this.jDownloaderOnline = false;
      }
      if (requestedJDownloader.launchPath !== currentJDownloader.launchPath) {
        Services.prefs.setStringPref(
          PREF_JDOWNLOADER_LAUNCH_PATH,
          requestedJDownloader.launchPath,
        );
      }
      if (requestedJDownloader.autoLaunch !== currentJDownloader.autoLaunch) {
        Services.prefs.setBoolPref(
          PREF_JDOWNLOADER_AUTO_LAUNCH,
          requestedJDownloader.autoLaunch,
        );
      }
    }
    if (requestedIDMBridgeEnabled !== currentIDMBridgeEnabled) {
      Services.prefs.setBoolPref(
        PREF_IDM_BRIDGE,
        requestedIDMBridgeEnabled,
      );
      try {
        this.syncIDMBridge(requestedIDMBridgeEnabled);
      } catch (error) {
        Services.prefs.setBoolPref(
          PREF_IDM_BRIDGE,
          currentIDMBridgeEnabled,
        );
        this.syncIDMBridge(currentIDMBridgeEnabled);
        throw error;
      }
    }
    if (
      JSON.stringify(requestedAutoCaptureRules) !==
        JSON.stringify(currentAutoCaptureRules)
    ) {
      await this.enqueueAutoCaptureRulesUpdate(
        () => requestedAutoCaptureRules,
      );
    }
    if (JSON.stringify(requestedLinkGroups) !== JSON.stringify(currentLinkGroups)) {
      Services.prefs.setStringPref(PREF_LINK_GROUPS, JSON.stringify(requestedLinkGroups));
    }
    if (
      JSON.stringify(requestedMirrorSettings) !==
        JSON.stringify(currentMirrorSettings)
    ) {
      Services.prefs.setStringPref(
        PREF_MIRRORS,
        JSON.stringify(requestedMirrorSettings),
      );
    }
    return this.readSettings();
  }

  async startup() {
    this.serviceReady = false;
    if (!this.platformDefinition) {
      throw new Error("DownloadIt supports Windows and Linux only");
    }

    this.binaryPath = this.platformDefinition.flashGotSupported
      ? await this.deployBinary()
      : "";
    await this.reloadCustomDownloaders();
    await this.reloadAutoCaptureRules();
    registerLinkCollectorActor();
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

    try {
      this.registerToolbarWidget();
    } catch (error) {
      console.error("DownloadIt: toolbar widget registration failed", error);
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
    this.migrateDefaultManagerPreference();
    this.syncIDMBridge();
    for (const descriptor of this.listCustomDownloaders()) {
      const downloader = descriptor.configuration;
      if (descriptor.available && downloader.type === "aria2" && downloader.aria2.autoStart) {
        this.ensureAria2Running(downloader).catch(error => {
          console.error("DownloadIt: aria2 startup failed", error);
        });
      }
    }
    this.serviceReady = true;
  }

  async shutdown() {
    this.serviceReady = false;
    this.idmBridge.stop();
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

    unregisterLinkCollectorActor();

    for (const controller of this.controllers.values()) {
      controller.destroy();
    }
    this.controllers.clear();
    for (const controller of this.panelControllers.values()) {
      controller.destroy();
    }
    this.panelControllers.clear();
    this.unregisterToolbarWidget();
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

  migrateDefaultManagerPreference() {
    const raw = Services.prefs.getStringPref(PREF_DEFAULT_MANAGER, "").trim();
    if (!raw || raw.startsWith("{") || Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER)) {
      return;
    }
    const ref = parseDownloaderRef(raw);
    if (this.providers.getDownloader(ref)) {
      Services.prefs.setStringPref(PREF_DEFAULT_MANAGER, serializeDownloaderRef(ref));
    }
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
      for (const controller of this.panelControllers.values()) {
        controller.refreshLocalization().catch(error => {
          console.error("DownloadIt: panel locale refresh failed", error);
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

    let controller = null;
    let panelController = null;
    try {
      const localizationReady = initializeDownloadItLocalization(window);
      const initializeLocalization = () => localizationReady;
      controller = new DownloadItContextMenuController(
        this,
        window,
        initializeLocalization,
      );
      panelController = new DownloadItPanelViewController(
        this,
        window,
        initializeLocalization,
      );
      controller.init();
      panelController.init();
      this.controllers.set(window, controller);
      this.panelControllers.set(window, panelController);
      window.addEventListener("unload", () => {
        controller.destroy();
        panelController.destroy();
        this.controllers.delete(window);
        this.panelControllers.delete(window);
      }, { once: true });
    } catch (error) {
      controller?.destroy();
      panelController?.destroy();
      console.error("DownloadIt: browser window initialization failed", error);
    }
  }

  registerToolbarWidget() {
    if (CustomizableUI.getWidget(DOWNLOADIT_TOOLBAR_WIDGET_ID)) {
      CustomizableUI.destroyWidget(DOWNLOADIT_TOOLBAR_WIDGET_ID);
    }
    CustomizableUI.createWidget({
      id: DOWNLOADIT_TOOLBAR_WIDGET_ID,
      type: "view",
      viewId: DOWNLOADIT_PANEL_VIEW_ID,
      defaultArea: CustomizableUI.AREA_NAVBAR,
      removable: true,
      l10nId: "downloadit-toolbar-button",
      onCreated: node => {
        node.setAttribute("image", TOOLBAR_ICON);
      },
      onViewShowing: event => {
        const window = event.target?.ownerDocument?.defaultView;
        this.panelControllers.get(window)?.onViewShowing(event);
      },
      onViewHiding: event => {
        const window = event.target?.ownerDocument?.defaultView;
        this.panelControllers.get(window)?.onViewHiding(event);
      },
    });
  }

  unregisterToolbarWidget() {
    try {
      if (CustomizableUI.getWidget(DOWNLOADIT_TOOLBAR_WIDGET_ID)) {
        CustomizableUI.destroyWidget(DOWNLOADIT_TOOLBAR_WIDGET_ID);
      }
    } catch (error) {
      console.error("DownloadIt: toolbar widget cleanup failed", error);
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
    this.refreshConfiguredBuiltInProtocols();
    if (this.platformDefinition?.flashGotSupported) {
      await this.providers.refresh(FLASHGOT_PROVIDER, {
        persistDefault: false,
      });
    }
    if (
      persistDefault &&
      !this.configuredDefaultRef &&
      !Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER)
    ) {
      const firstAvailable = this.managers[0];
      if (firstAvailable) {
        Services.prefs.setStringPref(
          PREF_DEFAULT_MANAGER,
          serializeDownloaderRef(firstAvailable.ref),
        );
      }
    }
    return this.managers.map(downloader => downloader.name);
  }

  refreshConfiguredBuiltInProtocols() {
    if (this.builtInRefreshPromise) {
      return this.builtInRefreshPromise;
    }
    const configured = BUILT_IN_PROTOCOLS.filter(protocol => {
      try {
        if (protocol.id === JDOWNLOADER_PROVIDER) {
          return this.getJDownloaderSettings().enabled;
        }
      } catch {}
      return false;
    });
    if (!configured.length) {
      return null;
    }
    const probes = configured.map(protocol => {
      try {
        return Promise.resolve(this.providers.refresh(protocol.provider));
      } catch (error) {
        return Promise.reject(error);
      }
    });
    const promise = Promise.allSettled(probes).finally(() => {
      if (this.builtInRefreshPromise === promise) {
        this.builtInRefreshPromise = null;
      }
    });
    this.builtInRefreshPromise = promise;
    return promise;
  }

  async refreshFlashGotManagers({ persistDefault = true } = {}) {
    if (!this.platformDefinition?.flashGotSupported) {
      return [];
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const outputPath = this.createTemporaryPath("managers", ".json");
      try {
        await this.runFlashGotProcess(["--list-json", outputPath]);
        const raw = (await this.readManagerOutput(outputPath)).replace(/^\uFEFF/, "");
        const managers = parseAvailableManagers(JSON.parse(raw));
        this.flashGotManagers = managers;
        Services.prefs.setStringPref(PREF_MANAGER_CACHE, JSON.stringify(managers));
        return [...managers];
      } finally {
        await this.removeTemporaryFile(outputPath);
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async refreshJDownloader() {
    const settings = this.getJDownloaderSettings();
    if (!settings.enabled) {
      return null;
    }
    return this.probeJDownloader({ endpoint: settings.endpoint });
  }

  async probeJDownloader({
    endpoint = this.getJDownloaderSettings().endpoint,
    persist = true,
    updateState = true,
  } = {}) {
    let normalizedEndpoint;
    try {
      normalizedEndpoint = normalizeJDownloaderEndpoint(endpoint);
    } catch (error) {
      throw new DownloadItError(
        error?.code || "jdownloader-endpoint-invalid",
        error?.args || {},
      );
    }
    const isConfiguredEndpoint = () => {
      try {
        const settings = this.getJDownloaderSettings();
        return settings.enabled &&
          normalizedEndpoint === normalizeJDownloaderEndpoint(settings.endpoint);
      } catch {
        return false;
      }
    };
    const shareProbe = persist && updateState && isConfiguredEndpoint();
    if (
      shareProbe &&
      this.jDownloaderProbePromise &&
      this.jDownloaderProbeEndpoint === normalizedEndpoint
    ) {
      return this.jDownloaderProbePromise;
    }

    const probe = (async () => {
      const response = await this.sendJDownloaderRequest(
        "GET",
        normalizedEndpoint,
        null,
        JDOWNLOADER_REQUEST_TIMEOUT_MS,
      );
      if (response.status !== 200) {
        throw new DownloadItError("jdownloader-http-error", {
          status: response.status,
        });
      }
      let discovery;
      try {
        discovery = parseJDownloaderDiscoveryResponse(response.text);
      } catch (error) {
        throw new DownloadItError(
          error?.code || "jdownloader-discovery-invalid",
          error?.args || {},
        );
      }
      const existingPath = this.existingLocalPath(discovery.path);
      if (!existingPath) {
        throw new DownloadItError("jdownloader-discovery-invalid");
      }
      discovery.path = existingPath;
      if (persist && isConfiguredEndpoint()) {
        this.storeJDownloaderDiscovery(discovery);
      }
      if (updateState && isConfiguredEndpoint()) {
        this.jDownloaderOnline = true;
      }
      return discovery;
    })().catch(error => {
      if (updateState && isConfiguredEndpoint()) {
        this.jDownloaderOnline = false;
      }
      throw error;
    });

    if (!shareProbe) {
      return probe;
    }
    const sharedProbe = probe.finally(() => {
      if (this.jDownloaderProbePromise === sharedProbe) {
        this.jDownloaderProbePromise = null;
        this.jDownloaderProbeEndpoint = "";
      }
    });
    this.jDownloaderProbePromise = sharedProbe;
    this.jDownloaderProbeEndpoint = normalizedEndpoint;
    return sharedProbe;
  }

  sendJDownloaderRequest(
    method,
    endpoint,
    body = null,
    timeoutMs = JDOWNLOADER_REQUEST_TIMEOUT_MS,
  ) {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = this.createPrivilegedXMLHttpRequest();
        request.open(method, endpoint, true);
        request.timeout = timeoutMs;
        const channel = request.channel.QueryInterface(Ci.nsIHttpChannel);
        channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE |
          Ci.nsIRequest.INHIBIT_CACHING |
          Ci.nsIRequest.LOAD_ANONYMOUS |
          Ci.nsIChannel.LOAD_BYPASS_URL_CLASSIFIER;
        channel.setTRRMode(Ci.nsIRequest.TRR_DISABLED_MODE);
        channel.loadInfo.httpsOnlyStatus |= Ci.nsILoadInfo.HTTPS_ONLY_EXEMPT;
        channel.loadInfo.allowDeprecatedSystemRequests = true;
        channel.redirectionLimit = 0;
        channel.allowSTS = false;
        // JDownloader recognizes FlashGot callers by the complete local path.
        channel.setNewReferrerInfo(
          getJDownloaderReferer(endpoint),
          Ci.nsIReferrerInfo.UNSAFE_URL,
          true,
        );
        if (method === "POST") {
          request.setRequestHeader(
            "Content-Type",
            "application/x-www-form-urlencoded; charset=UTF-8",
          );
        }
      } catch (error) {
        reject(new DownloadItError("jdownloader-unavailable", {
          error: error?.message || String(error),
        }));
        return;
      }
      request.addEventListener("load", () => {
        resolve({ status: request.status, text: request.responseText || "" });
      }, { once: true });
      const fail = () => reject(new DownloadItError("jdownloader-unavailable"));
      request.addEventListener("error", fail, { once: true });
      request.addEventListener("abort", fail, { once: true });
      request.addEventListener("timeout", fail, { once: true });
      try {
        request.send(body);
      } catch (error) {
        reject(new DownloadItError("jdownloader-unavailable", {
          error: error?.message || String(error),
        }));
      }
    });
  }

  createPrivilegedXMLHttpRequest() {
    if (typeof globalThis.XMLHttpRequest === "function") {
      return new globalThis.XMLHttpRequest();
    }
    try {
      const hiddenWindow = Services.appShell.hiddenDOMWindow;
      if (typeof hiddenWindow?.XMLHttpRequest === "function") {
        return new hiddenWindow.XMLHttpRequest();
      }
    } catch {}
    throw new Error("Firefox XMLHttpRequest is unavailable");
  }

  async getManagersForDownloadDialog() {
    if (this.downloadDialogManagers.length > 0) {
      return this.downloadDialogManagers.map(downloader => ({ ...downloader }));
    }
    try {
      await this.refreshManagers({ persistDefault: false });
      return this.downloadDialogManagers.map(downloader => ({ ...downloader }));
    } catch {
      return this.downloadDialogManagers.map(downloader => ({ ...downloader }));
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

  getProviderDownloadOptions(downloader) {
    return {
      autoStartTask: downloader?.capabilities?.taskStart === true
        ? Services.prefs.getBoolPref(PREF_AUTO_START_TASKS, true)
        : true,
    };
  }

  async dispatchDownload(downloader, job, runtimeContexts = []) {
    const prepared = this.mirrorRegistry.rewriteJob(job, this.mirrorSettings);
    return this.providers.download(
      downloader.ref,
      prepared.job,
      runtimeContexts,
      this.getProviderDownloadOptions(downloader),
    );
  }

  async downloadLauncher({
    launcher,
    context = null,
    dialogWindow = null,
    manager,
    filename = "",
  } = {}) {
    const source = launcher?.source;
    const mimeInfo = launcher?.MIMEInfo;
    if (
      !source?.spec ||
      classifyDownloadTarget({
        url: source.spec,
        filename: filename || launcher.suggestedFileName ||
          launcher?.targetFile?.leafName || "",
        mimeType: mimeInfo?.MIMEType || mimeInfo?.type || "",
        primaryExtension: mimeInfo?.primaryExtension || "",
      }) !== DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED
    ) {
      throw new DownloadItError("unsupported-url");
    }

    const originalSource = launcher?.channel?.originalURI?.spec || "";
    const mirrorSource = originalSource && this.mirrorRegistry.resolve(
      originalSource,
      this.mirrorSettings,
    )
      ? originalSource
      : source.spec;
    const sourceWindow = this.getLauncherSourceWindow(context);
    const browser = sourceWindow?.docShell?.chromeEventHandler ||
      this.getBrowserWindow(dialogWindow)?.gBrowser?.selectedBrowser ||
      null;
    const browsingContext = sourceWindow?.browsingContext ||
      sourceWindow?.docShell?.browsingContext || browser?.browsingContext || null;
    const loadInfo = launcher?.channel?.loadInfo || null;
    const downloadPageReferer = browser?.currentURI?.spec ||
      sourceWindow?.location?.href || "";
    const referer = source.referrerInfo?.originalReferrer?.spec || "";
    return this.downloadLink({
      url: mirrorSource,
      description: launcher.suggestedFileName || mirrorSource,
      filename: filename || launcher.suggestedFileName || "",
      browser,
      referer,
      downloadPageReferer,
      browsingContextId: browsingContext?.id || 0,
      loadingPrincipal: loadInfo?.loadingPrincipal ||
        browsingContext?.currentWindowGlobal?.documentPrincipal || null,
      referrerInfo: source.referrerInfo || null,
      cookieJarSettings: loadInfo?.cookieJarSettings ||
        browsingContext?.currentWindowGlobal?.cookieJarSettings || null,
      userContextId: loadInfo?.originAttributes?.userContextId ??
        browsingContext?.originAttributes?.userContextId ?? 0,
      isPrivate: Boolean(
        browsingContext?.usePrivateBrowsing ||
        loadInfo?.originAttributes?.privateBrowsingId,
      ),
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
    const requestedRef = typeof manager === "object"
      ? manager?.ref || manager
      : parseDownloaderRef(manager);
    if (
      requestedRef?.provider === FLASHGOT_PROVIDER &&
      !this.platformDefinition?.flashGotSupported
    ) {
      throw new DownloadItError("flashgot-unsupported-platform");
    }
    const downloader = this.resolveDownloader(manager);
    if (!downloader?.available) {
      throw new Error(`Unsupported download manager: ${manager}`);
    }
    if (!Array.isArray(contexts) || contexts.length === 0) {
      throw new DownloadItError("unsupported-url");
    }

    const pageContext = contexts[0] || {};
    const browser = pageContext.browser;
    const pageReferrerURI = pageContext.downloadPageReferer &&
      isSupportedContextURL(pageContext.downloadPageReferer)
      ? Services.io.newURI(pageContext.downloadPageReferer)
      : null;
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
    const runtimeContexts = [];
    for (const context of contexts) {
      if (
        classifyDownloadTarget({
          url: context?.url || "",
          filename: context?.filename || "",
        }) !== DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED
      ) {
        continue;
      }
      const uri = Services.io.newURI(context.url);
      const cookieRecords = omitCookies
        ? []
        : getCookiesForURI(uri, context.browser || browser, cookieOptions);
      links.push({
        url: context.url,
        description: context.description,
        filename: context.filename,
        postData: context.postData ?? context.postdata ?? "",
        cookies: cookieRecords.map(
          cookie => `${cookie.name}=${cookie.value}`,
        ).join("; "),
        cookieRecords,
      });
      runtimeContexts.push(context);
    }

    if (links.length === 0) {
      throw new DownloadItError("unsupported-url");
    }

    const job = buildDownloadBatchJob({
      manager: downloader.ref.provider === FLASHGOT_PROVIDER
        ? downloader.ref.id
        : downloader.name,
      links,
      referer: isSupportedContextURL(pageContext.referer)
        ? pageContext.referer
        : "",
      downloadPageReferer: pageReferrerURI?.spec || "",
      downloadPageCookies,
      userAgent,
    });
    for (let index = 0; index < job.links.length; index++) {
      job.links[index].cookieRecords = links[index].cookieRecords;
    }
    await this.dispatchDownload(
      downloader,
      job,
      runtimeContexts,
    );
  }

  async downloadViaNative(managerId, job, runtimeContexts = []) {
    if (managerId !== NATIVE_DOWNLOADER_ID) {
      throw new DownloadItError("native-download-failed", {
        error: `Unknown native downloader: ${String(managerId || "")}`,
      });
    }

    let directory;
    try {
      directory = await Downloads.getPreferredDownloadsDirectory();
    } catch (error) {
      throw new DownloadItError("native-download-failed", {
        error: error?.message || String(error),
      });
    }

    const results = await Promise.allSettled(job.links.map((link, index) =>
      this.startNativeDownload(link, runtimeContexts[index] || {}, directory)
    ));
    const succeeded = results.filter(result => result.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (!failed) {
      return { succeeded, failed };
    }
    if (succeeded) {
      throw new DownloadItError("native-partial-failure", { succeeded, failed });
    }
    const firstError = results.find(result => result.status === "rejected")?.reason;
    throw new DownloadItError("native-download-failed", {
      error: firstError?.message || String(firstError || ""),
    });
  }

  async startNativeDownload(link, runtimeContext, directory) {
    if (!isNativeDownloadURL(link.url)) {
      throw new Error(`Unsupported native download URL: ${link.url}`);
    }

    const filename = DownloadPaths.sanitize(
      getNativeDownloadFilenameCandidate(link),
    ) || "download";
    const targetTemplate = await IOUtils.getFile(directory);
    targetTemplate.append(filename);
    const targetFile = await DownloadPaths.createNiceUniqueFile(targetTemplate);
    const targetPath = targetFile.path;
    const partFilePath = `${targetPath}.part`;

    try {
      const download = await Downloads.createDownload({
        source: this.createNativeDownloadSource(link, runtimeContext),
        target: { path: targetPath, partFilePath },
      });
      download.tryToKeepPartialData = true;
      const startPromise = download.start();
      Promise.resolve(startPromise).catch(error => {
        console.error("DownloadIt: Firefox download failed", error);
      });
      try {
        const list = await Downloads.getList(Downloads.ALL);
        await list.add(download);
      } catch (error) {
        try {
          await download.cancel();
        } catch {}
        throw error;
      }
      return download;
    } catch (error) {
      await IOUtils.remove(partFilePath, { ignoreAbsent: true });
      await IOUtils.remove(targetPath, { ignoreAbsent: true });
      throw error;
    }
  }

  createNativeDownloadSource(link, runtimeContext = {}) {
    const browsingContext = this.resolveNativeBrowsingContext(runtimeContext);
    const windowGlobal = browsingContext?.currentWindowGlobal;
    const loadingPrincipal = runtimeContext.loadingPrincipal ||
      runtimeContext.principal || windowGlobal?.documentPrincipal ||
      runtimeContext.browser?.contentPrincipal || null;
    const cookieJarSettings = runtimeContext.cookieJarSettings ||
      windowGlobal?.cookieJarSettings || browsingContext?.cookieJarSettings || null;
    const referrerSpec = browsingContext?.currentURI?.spec ||
      runtimeContext.referer || "";
    const referrerInfo = runtimeContext.referrerInfo ||
      this.createNativeReferrerInfo(referrerSpec) || null;
    const originAttributes = loadingPrincipal?.originAttributes ||
      browsingContext?.originAttributes || {};
    const browsingContextId = Number(runtimeContext.browsingContextId ||
      browsingContext?.id || 0);
    const userContextId = Number(runtimeContext.userContextId ??
      originAttributes.userContextId ?? 0);
    const isPrivate = typeof runtimeContext.isPrivate === "boolean"
      ? runtimeContext.isPrivate
      : Boolean(
          browsingContext?.usePrivateBrowsing ||
          originAttributes.privateBrowsingId,
        );
    const source = { url: link.url, isPrivate };

    if (loadingPrincipal) {
      source.loadingPrincipal = loadingPrincipal;
    }
    if (referrerInfo) {
      source.referrerInfo = referrerInfo;
    }
    if (cookieJarSettings) {
      source.cookieJarSettings = cookieJarSettings;
    }
    if (Number.isInteger(userContextId) && userContextId >= 0) {
      source.userContextId = userContextId;
    }
    if (Number.isInteger(browsingContextId) && browsingContextId > 0) {
      source.browsingContextId = browsingContextId;
    }

    if (link.postdata) {
      const postData = link.postdata;
      const contentType = String(
        runtimeContext.postContentType || "application/x-www-form-urlencoded",
      );
      source.adjustChannel = channel => {
        const stream = Cc["@mozilla.org/io/string-input-stream;1"]
          .createInstance(Ci.nsIStringInputStream);
        stream.setUTF8Data(postData);
        channel.QueryInterface(Ci.nsIUploadChannel2).explicitSetUploadStream(
          stream,
          contentType,
          -1,
          "POST",
        );
      };
    }
    return source;
  }

  resolveNativeBrowsingContext(runtimeContext = {}) {
    const root = runtimeContext.browser?.browsingContext || null;
    const requestedId = Number(runtimeContext.browsingContextId || 0);
    if (!root || !requestedId) {
      return root;
    }
    const pending = [root];
    const seen = new Set();
    while (pending.length) {
      const browsingContext = pending.shift();
      if (!browsingContext || seen.has(browsingContext)) {
        continue;
      }
      seen.add(browsingContext);
      if (browsingContext.id === requestedId) {
        return browsingContext;
      }
      pending.push(...(browsingContext.children || []));
    }
    return root;
  }

  createNativeReferrerInfo(spec) {
    if (!isNativeDownloadURL(spec)) {
      return null;
    }
    try {
      const referrerInfo = Cc["@mozilla.org/referrer-info;1"]
        .createInstance(Ci.nsIReferrerInfo);
      referrerInfo.init(
        Ci.nsIReferrerInfo.EMPTY,
        true,
        Services.io.newURI(spec),
      );
      return referrerInfo;
    } catch {
      return null;
    }
  }

  syncIDMBridge(enabled = Services.prefs.getBoolPref(
    PREF_IDM_BRIDGE,
    false,
  )) {
    if (enabled) {
      this.idmBridge.start();
    } else {
      this.idmBridge.stop();
    }
  }

  async downloadIDMTask(task) {
    const downloader = this.defaultDownloader;
    if (!downloader?.available) {
      throw new Error("No supported download manager is available");
    }
    const cookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false)
      ? ""
      : String(task.cookie || "");
    const job = buildDownloadBatchJob({
      manager: downloader.ref.provider === FLASHGOT_PROVIDER
        ? downloader.ref.id
        : downloader.name,
      links: [{
        url: task.url,
        description: task.filename || task.url,
        filename: task.filename,
        cookies,
      }],
      referer: isSupportedContextURL(task.referer) ? task.referer : "",
      downloadPageReferer: isSupportedContextURL(task.sourcePage)
        ? task.sourcePage
        : "",
      userAgent: String(task.userAgent || ""),
    });
    job.links[0].cookieRecords = [];
    await this.dispatchDownload(
      downloader,
      job,
      [{
        referer: isNativeDownloadURL(task.referer)
          ? task.referer
          : isNativeDownloadURL(task.sourcePage) ? task.sourcePage : "",
        isPrivate: false,
      }],
    );
  }

  async downloadViaFlashGot(managerName, job) {
    if (!this.platformDefinition?.flashGotSupported) {
      throw new DownloadItError("flashgot-unsupported-platform");
    }
    const inputPath = this.createTemporaryPath("job", ".json");
    try {
      await IOUtils.writeUTF8(inputPath, JSON.stringify({
        ...job,
        dmName: managerName,
      }));
      await this.runFlashGotProcess(["--job-json", inputPath]);
    } finally {
      await this.removeTemporaryFile(inputPath);
    }
  }

  async downloadViaCustom(id, job) {
    const downloader = this.customDownloaderDocument.downloaders.find(
      entry => entry.id === id,
    );
    if (!downloader || !downloader.enabled) {
      throw new Error(`Unsupported custom downloader: ${id}`);
    }
    if (downloader.type === "command") {
      return this.downloadViaCommand(downloader, job);
    }
    return this.downloadViaAria2(downloader, job);
  }

  async downloadViaCommand(downloader, job) {
    const template = downloader.command.argumentsTemplate;
    const batch = commandTemplateUsesBatch(template);
    const temporaryPaths = [];
    const urls = job.links.map(link => link.url);
    let urlFile = "";
    let cookieFile = "";
    let launchAttempted = false;
    try {
      if (/\[[^\]]*\bUFILE\b[^\]]*\]/.test(template)) {
        urlFile = this.createTemporaryPath("urls", ".txt");
        temporaryPaths.push(urlFile);
        const lineBreak = this.platformDefinition?.id === "linux" ? "\n" : "\r\n";
        await IOUtils.writeUTF8(urlFile, `${urls.join(lineBreak)}${lineBreak}`);
      }
      if (/\[[^\]]*\bCFILE\b[^\]]*\]/.test(template)) {
        cookieFile = this.createTemporaryPath("cookies", ".txt");
        temporaryPaths.push(cookieFile);
        await IOUtils.writeUTF8(cookieFile, this.buildNetscapeCookieFile(job.links));
      }

      let folder = "";
      try {
        folder = await Downloads.getPreferredDownloadsDirectory();
      } catch {}

      const links = batch ? [job.links[0]] : job.links;
      const argumentLists = links.map(link => expandCommandTemplate(template, {
        URL: link.url,
        FNAME: link.filename,
        COMMENT: link.desc,
        REFERER: job.referer,
        COOKIE: link.cookies,
        CFILE: cookieFile,
        FOLDER: folder,
        POST: link.postdata,
        RAWPOST: link.postdata,
        HEADERS: this.buildHeaderBlock(link, job),
        ULIST: urls,
        UFILE: urlFile,
        USERPASS: this.getURLUserPass(link.url),
        UA: job.useragent,
      }));
      launchAttempted = true;
      await this.launchCustomProcesses(
        downloader.command.executablePath,
        argumentLists,
        temporaryPaths,
        downloader.startHidden,
      );
    } finally {
      if (!launchAttempted) {
        await Promise.allSettled(
          temporaryPaths.map(path => this.removeTemporaryFile(path)),
        );
      }
    }
  }

  buildHeaderBlock(link, job) {
    return [
      job.useragent ? `User-Agent: ${job.useragent}` : "",
      job.referer ? `Referer: ${job.referer}` : "",
      link.cookies ? `Cookie: ${link.cookies}` : "",
    ].filter(Boolean).join("\r\n");
  }

  getURLUserPass(value) {
    try {
      const url = new URL(value);
      if (!url.username) {
        return "";
      }
      return decodeURIComponent(url.username) +
        (url.password ? `:${decodeURIComponent(url.password)}` : "");
    } catch {
      return "";
    }
  }

  buildNetscapeCookieFile(links) {
    const lines = ["# Netscape HTTP Cookie File"];
    const seen = new Set();
    for (const link of links) {
      for (const cookie of link.cookieRecords || []) {
        const key = `${cookie.host}\u0001${cookie.path}\u0001${cookie.name}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        let host = String(cookie.host || "");
        if (cookie.isHttpOnly) {
          host = `#HttpOnly_${host}`;
        }
        lines.push([
          host,
          cookie.isDomain ? "TRUE" : "FALSE",
          cookie.path || "/",
          cookie.isSecure ? "TRUE" : "FALSE",
          Number(cookie.expires) || 0,
          cookie.name,
          cookie.value,
        ].join("\t"));
      }
    }
    const lineBreak = this.platformDefinition?.id === "linux" ? "\n" : "\r\n";
    return `${lines.join(lineBreak)}${lineBreak}`;
  }

  async launchCustomProcesses(
    executablePath,
    argumentLists,
    temporaryPaths,
    startHidden = true,
  ) {
    let remaining = argumentLists.length;
    let started = 0;
    let failed = 0;
    const cleanup = () => {
      remaining--;
      if (remaining === 0) {
        Promise.allSettled(
          temporaryPaths.map(path => this.removeTemporaryFile(path)),
        );
      }
    };
    for (const argumentsList of argumentLists) {
      try {
        this.startDetachedProcess(
          executablePath,
          argumentsList,
          cleanup,
          startHidden,
        );
        started++;
      } catch (error) {
        failed++;
        cleanup();
        console.error("DownloadIt: custom process launch failed", error);
      }
    }
    if (!started) {
      throw new DownloadItError("command-launch-failed");
    }
    if (failed) {
      throw new DownloadItError("command-partial-failure", {
        succeeded: started,
        failed,
      });
    }
  }

  startDetachedProcess(
    executablePath,
    argumentsList,
    onExit = null,
    startHidden = true,
  ) {
    const executable = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    executable.initWithPath(this.resolveExecutablePath(executablePath));
    if (
      !executable.exists() ||
      !executable.isFile() ||
      (this.platformDefinition?.id === "linux" && !executable.isExecutable())
    ) {
      throw new Error(`Executable not found: ${executablePath}`);
    }
    const process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    process.init(executable);
    if (this.platformDefinition?.processWindowHidingSupported) {
      process.startHidden = Boolean(startHidden);
    }
    process.runwAsync(argumentsList, argumentsList.length, {
      observe(subject, topic) {
        if (topic !== "process-finished" || process.exitValue !== 0) {
          console.error(
            `DownloadIt: process ${executablePath} finished with ${topic}`,
          );
        }
        onExit?.();
      },
    });
    return process;
  }

  async downloadViaJDownloader(
    managerId,
    job,
    { autoStartTask = true } = {},
  ) {
    if (managerId !== JDOWNLOADER_DOWNLOADER_ID) {
      throw new DownloadItError("jdownloader-submit-failed");
    }
    let settings;
    try {
      const currentSettings = this.getJDownloaderSettings();
      if (currentSettings.enabled === false) {
        throw new DownloadItError("jdownloader-unavailable");
      }
      settings = {
        ...currentSettings,
        ...this.normalizeJDownloaderSettings(
          currentSettings,
          { requireExistingPath: false },
        ),
      };
    } catch (error) {
      throw new DownloadItError(
        error?.code || "jdownloader-endpoint-invalid",
        error?.args || {},
      );
    }

    let directory = "";
    try {
      directory = await Downloads.getPreferredDownloadsDirectory();
    } catch {}
    let body;
    try {
      body = buildJDownloaderRequest(job, {
        autoStartTask,
        directory,
        packageName: "DownloadIt",
      });
    } catch (error) {
      throw new DownloadItError(
        error?.code || "jdownloader-submit-failed",
        error?.args || {},
      );
    }

    try {
      await this.probeJDownloader({ endpoint: settings.endpoint });
    } catch (error) {
      if (error?.code !== "jdownloader-unavailable") {
        throw error;
      }
      await this.ensureJDownloaderRunning(settings);
    }

    let response;
    try {
      response = await this.sendJDownloaderRequest(
        "POST",
        settings.endpoint,
        body,
      );
    } catch (error) {
      if (error?.code === "jdownloader-unavailable") {
        this.jDownloaderOnline = false;
        throw new DownloadItError("jdownloader-submit-failed");
      }
      throw error;
    }
    if (response.status !== 200) {
      throw new DownloadItError("jdownloader-http-error", {
        status: response.status,
      });
    }
    return { succeeded: job.links.length, failed: 0 };
  }

  async ensureJDownloaderRunning(
    settings = this.getJDownloaderSettings(),
    {
      delay = milliseconds => new Promise(resolve =>
        setTimeoutPromise(resolve, milliseconds)
      ),
      maxProbes = JDOWNLOADER_MAX_STARTUP_PROBES,
    } = {},
  ) {
    if (!settings.autoLaunch) {
      throw new DownloadItError("jdownloader-unavailable");
    }
    if (this.jDownloaderStartupPromise) {
      return this.jDownloaderStartupPromise;
    }
    const promise = (async () => {
      let launch;
      try {
        launch = this.resolveJDownloaderLaunch(settings);
      } catch (error) {
        throw new DownloadItError(
          error?.code || "jdownloader-launch-path-invalid",
          error?.args || {},
        );
      }
      if (!launch) {
        throw new DownloadItError("jdownloader-launch-failed");
      }
      try {
        this.startDetachedProcess(
          launch.executablePath,
          launch.argumentsList,
          null,
          false,
        );
      } catch (error) {
        throw new DownloadItError("jdownloader-launch-failed", {
          error: error?.message || String(error),
        });
      }

      for (let attempt = 0; attempt < maxProbes; attempt++) {
        await delay(JDOWNLOADER_RETRY_DELAY_MS);
        try {
          await this.probeJDownloader({ endpoint: settings.endpoint });
          return true;
        } catch (error) {
          if (
            error?.code !== "jdownloader-unavailable" &&
            error?.code !== "jdownloader-http-error"
          ) {
            throw error;
          }
        }
      }
      throw new DownloadItError("jdownloader-start-timeout");
    })().finally(() => {
      this.jDownloaderStartupPromise = null;
    });
    this.jDownloaderStartupPromise = promise;
    return promise;
  }

  async downloadViaAria2(downloader, job) {
    const config = downloader.aria2;
    const links = job.links.map(link => ({
      url: link.url,
      filename: link.filename,
      referer: job.referer,
      userAgent: job.useragent,
      cookies: link.cookies,
    }));
    const payload = buildAria2Request(
      links,
      config,
      `downloadit-${Services.uuid.generateUUID().toString().replace(/[{}]/g, "")}`,
    );
    let response;
    try {
      response = await this.sendAria2Request(config, payload);
    } catch (error) {
      if (!error?.aria2Unavailable || !config.autoStart) {
        throw error;
      }
      await this.ensureAria2Running(downloader);
      response = await this.sendAria2Request(config, payload);
    }
    const result = inspectAria2Response(response, links.length, config.secret);
    if (result.failed) {
      throw new DownloadItError("aria2-partial-failure", result);
    }
    return result;
  }

  async sendAria2Request(config, payload, timeoutMs = 3000) {
    const { fetchRequest, FetchAbortController } =
      this.getPrivilegedFetchEnvironment();
    if (!fetchRequest) {
      const error = new DownloadItError("aria2-unavailable");
      error.aria2Unavailable = true;
      throw error;
    }
    const controller = FetchAbortController ? new FetchAbortController() : null;
    const timer = controller
      ? setTimeoutPromise(() => controller.abort(), timeoutMs)
      : null;
    let response;
    try {
      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      };
      if (controller) {
        requestOptions.signal = controller.signal;
      }
      response = await fetchRequest(config.rpcUrl, requestOptions);
    } catch {
      const error = new DownloadItError("aria2-unavailable");
      error.aria2Unavailable = true;
      throw error;
    } finally {
      if (timer !== null) {
        clearTimeoutPromise(timer);
      }
    }
    if (!response.ok) {
      throw new DownloadItError("aria2-http-error", { status: response.status });
    }
    try {
      return await response.json();
    } catch {
      throw new DownloadItError("aria2-response-invalid");
    }
  }

  getPrivilegedFetchEnvironment() {
    let fetchRequest = typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : null;
    let FetchAbortController = typeof globalThis.AbortController === "function"
      ? globalThis.AbortController
      : null;
    if (!fetchRequest || !FetchAbortController) {
      try {
        const hiddenWindow = Services.appShell.hiddenDOMWindow;
        if (!fetchRequest && typeof hiddenWindow?.fetch === "function") {
          fetchRequest = hiddenWindow.fetch.bind(hiddenWindow);
        }
        if (
          !FetchAbortController &&
          typeof hiddenWindow?.AbortController === "function"
        ) {
          FetchAbortController = hiddenWindow.AbortController;
        }
      } catch {}
    }
    return { fetchRequest, FetchAbortController };
  }

  async ensureAria2Running(downloader) {
    if (!downloader.aria2.autoStart) {
      throw new DownloadItError("aria2-unavailable");
    }
    let rpcURL = null;
    try {
      rpcURL = new URL(downloader.aria2.rpcUrl);
    } catch {}
    if (
      rpcURL?.protocol !== "http:" ||
      !isLoopbackAria2URL(downloader.aria2.rpcUrl)
    ) {
      throw new DownloadItError("aria2-autostart-local-only");
    }
    if (this.aria2StartupPromises.has(downloader.id)) {
      return this.aria2StartupPromises.get(downloader.id);
    }
    const promise = (async () => {
      try {
        await this.testAria2Configuration(downloader.aria2);
        return true;
      } catch {}
      this.startDetachedProcess(
        downloader.aria2.executablePath,
        buildAria2StartupArguments(
          downloader.aria2,
          downloader.aria2.configurationPath
            ? this.resolveCustomFilePath(downloader.aria2.configurationPath)
            : "",
        ),
        null,
        downloader.startHidden,
      );
      const deadline = Date.now() + 5000;
      while (Date.now() <= deadline) {
        await new Promise(resolve => setTimeoutPromise(resolve, 250));
        try {
          await this.testAria2Configuration(downloader.aria2);
          return true;
        } catch {}
      }
      throw new DownloadItError("aria2-start-timeout");
    })().finally(() => {
      this.aria2StartupPromises.delete(downloader.id);
    });
    this.aria2StartupPromises.set(downloader.id, promise);
    return promise;
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

  async runFlashGotProcess(argumentsList) {
    if (!this.platformDefinition?.flashGotSupported) {
      throw new DownloadItError("flashgot-unsupported-platform");
    }
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
