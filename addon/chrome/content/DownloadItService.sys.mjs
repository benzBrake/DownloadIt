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
  getCookiesForURI,
  getManagerOutputEncoding,
} from "./DownloadItUtils.sys.mjs";
import {
  buildAria2Request,
  buildAria2StartupArguments,
  cloneCustomDownloaderDocument,
  commandTemplateUsesBatch,
  createDownloaderRef,
  createEmptyCustomDownloaderDocument,
  CUSTOM_PROVIDER,
  DownloaderProviderRegistry,
  downloaderRefKey,
  expandCommandTemplate,
  FLASHGOT_PROVIDER,
  inspectAria2Response,
  isLoopbackAria2URL,
  NATIVE_PROVIDER,
  normalizeCustomDownloaderDocument,
  parseDownloaderRef,
  redactAria2Secret,
  serializeDownloaderRef,
  stringifyCustomDownloaderDocument,
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
    this.profileDirectory = PathUtils.join(PathUtils.profileDir, PROFILE_DIRECTORY);
    this.customDownloadersPath = PathUtils.join(
      this.profileDirectory,
      CUSTOM_DOWNLOADERS_FILE,
    );
    this.flashGotManagers = this.loadManagerCache();
    this.customDownloaderDocument = createEmptyCustomDownloaderDocument();
    this.customDownloaderLoadError = null;
    this.controllers = new Map();
    this.downloadDialogControllers = new Map();
    this.downloadDialogWatchers = new Map();
    this.temporaryFiles = new Set();
    this.refreshPromise = null;
    this.aria2StartupPromises = new Map();
    this.providers = this.createProviderRegistry();
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
        provider: NATIVE_PROVIDER,
        listDownloaders: () => [],
        getDownloader: () => null,
        download: () => {
          throw new Error("Native downloader provider is not implemented");
        },
      },
    ]);
  }

  listFlashGotDownloaders() {
    return this.flashGotManagers.map(name => this.createDownloaderDescriptor({
      ref: createDownloaderRef(FLASHGOT_PROVIDER, name),
      name,
      type: "flashgot",
      custom: false,
      enabled: true,
      available: true,
      unavailableReason: "",
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
        if (!this.isLocalFile(configuration.command.executablePath)) {
          unavailableReason = "executable-not-found";
        }
      } else if (!unavailableReason && configuration.type === "aria2") {
        if (
          configuration.aria2.autoStart &&
          !this.isLocalFile(configuration.aria2.executablePath)
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
    if (!path || PathUtils.isAbsolute(path)) {
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
      file.initWithPath(this.resolveCustomFilePath(value));
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
      detectedManagerCount: this.flashGotManagers.length,
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
      autoExtensions: this.autoExtensions,
      defaultManagerLocked: Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER),
      omitCookiesLocked: Services.prefs.prefIsLocked(PREF_OMIT_COOKIES),
      autoExtensionsLocked: this.autoExtensionsLocked,
      binaryPath: this.binaryPath,
      serviceReady: Boolean(this.binaryPath),
      platformSupported: Services.appinfo.OS === "WINNT",
    };
  }

  async applySettings({
    defaultManager = null,
    omitCookies = false,
    autoExtensions = null,
    customDownloaders = null,
  } = {}) {
    const defaultManagerRequested = defaultManager !== null &&
      defaultManager !== undefined;
    const manager = defaultManagerRequested ? String(defaultManager || "") : "";
    const currentAutoExtensions = this.autoExtensions;
    const requestedAutoExtensions = autoExtensions == null
      ? currentAutoExtensions
      : normalizeAutoExtensions(autoExtensions);
    const configuredDefaultRef = this.configuredDefaultRef;
    const configuredDefaultKey = configuredDefaultRef
      ? downloaderRefKey(configuredDefaultRef)
      : "";
    const currentOmitCookies = Services.prefs.getBoolPref(PREF_OMIT_COOKIES, false);

    let requestedCustomDownloaders = customDownloaders == null
      ? null
      : validateCustomDownloaderDocument(customDownloaders);
    if (requestedCustomDownloaders && this.customDownloaderLoadError) {
      throw new DownloadItError("custom-config-blocked");
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
    const requestedDownloader = manager
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
    const defaultManagerLocked = Services.prefs.prefIsLocked(PREF_DEFAULT_MANAGER);
    if (
      defaultManagerLocked &&
      (
        (defaultManagerRequested && manager !== configuredDefaultKey) ||
        configuredCustomInvalidated
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
      this.autoExtensionsLocked &&
      JSON.stringify(requestedAutoExtensions) !== JSON.stringify(currentAutoExtensions)
    ) {
      throw new Error("The automatic extension preference is locked");
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
      } else if (configuredCustomInvalidated) {
        nextDefault = [
          ...this.listFlashGotDownloaders(),
          ...this.listCustomDownloaders(effectiveCustomDownloaders),
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
    await this.reloadCustomDownloaders();
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
    this.migrateDefaultManagerPreference();
    for (const descriptor of this.listCustomDownloaders()) {
      const downloader = descriptor.configuration;
      if (descriptor.available && downloader.type === "aria2" && downloader.aria2.autoStart) {
        this.ensureAria2Running(downloader).catch(error => {
          console.error("DownloadIt: aria2 startup failed", error);
        });
      }
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
    return this.providers.refresh(FLASHGOT_PROVIDER, { persistDefault });
  }

  async refreshFlashGotManagers({ persistDefault = true } = {}) {
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
      return this.managers.map(downloader => ({ ...downloader }));
    }
    try {
      await this.refreshManagers({ persistDefault: false });
      return this.managers.map(downloader => ({ ...downloader }));
    } catch {
      return this.managers.map(downloader => ({ ...downloader }));
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
    const downloader = this.resolveDownloader(manager);
    if (!downloader?.available) {
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
    }

    if (links.length === 0) {
      throw new DownloadItError("unsupported-url");
    }

    const job = buildDownloadBatchJob({
      manager: downloader.ref.provider === FLASHGOT_PROVIDER
        ? downloader.ref.id
        : downloader.name,
      links,
      referer: isSupportedURL(pageContext.referer) ? pageContext.referer : "",
      downloadPageReferer: pageReferrerURI?.spec || "",
      downloadPageCookies,
      userAgent,
    });
    for (let index = 0; index < job.links.length; index++) {
      job.links[index].cookieRecords = links[index].cookieRecords;
    }
    await this.providers.download(downloader.ref, job);
  }

  async downloadViaFlashGot(managerName, job) {
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
        await IOUtils.writeUTF8(urlFile, `${urls.join("\r\n")}\r\n`);
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
    return `${lines.join("\r\n")}\r\n`;
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
    if (!executable.exists() || !executable.isFile()) {
      throw new Error(`Executable not found: ${executablePath}`);
    }
    const process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    process.init(executable);
    process.startHidden = Boolean(startHidden);
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
