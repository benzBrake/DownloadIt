import { getUncoveredWindowsDrives, resolveDownloadDirectories } from "./DownloadItDirectories.sys.mjs";
import {
  classifyDownloadTarget,
  DOWNLOAD_TARGET_CLASSIFICATION,
} from "./DownloadItProtocol.sys.mjs";
import { createXULElement } from "./DownloadItXUL.sys.mjs";
import {
  getAutoCaptureDisposition,
  normalizeAutoExtensions,
} from "./DownloadItAutoCapture.sys.mjs";
import {
  decodeURLFilename,
  FILENAME_ENCODINGS,
  getFilenameEncodingCandidates,
  getURLFilenameCandidate,
} from "./DownloadItFilename.sys.mjs";

const DOWNLOAD_DIALOG_URL =
  "chrome://mozapps/content/downloads/unknownContentType.xhtml";
const MODE_ID = "mode";
const REMEMBER_CHOICE_ID = "rememberChoice";
const BASIC_BOX_ID = "basicBox";
const NORMAL_BOX_ID = "normalBox";
const DOWNLOADIT_OPTION_ID = "downloadit-download-option";
const DOWNLOADIT_MANAGER_ID = "downloadit-download-manager";
const DOWNLOADIT_MANAGER_POPUP_ID = "downloadit-download-manager-popup";
const DOWNLOADIT_ACTION_ID = "downloadit-download-action";
const HELPER_APP_DIALOG_MODULE = "resource://gre/modules/HelperAppDlg.sys.mjs";

let helperAppHook = null;

function normalizeDownloader(value) {
  if (typeof value === "string") {
    return {
      key: value,
      name: value,
      custom: false,
    };
  }
  return value;
}

const DOWNLOAD_ERROR_MESSAGES = {
  "native-download-failed": "downloadit-error-native-start",
  "native-partial-failure": "downloadit-error-native-partial",
  "command-launch-failed": "downloadit-error-command-launch",
  "command-partial-failure": "downloadit-error-command-partial",
  "aria2-unavailable": "downloadit-error-aria2-unavailable",
  "aria2-http-error": "downloadit-error-aria2-http",
  "aria2-response-invalid": "downloadit-error-aria2-response",
  "aria2-rpc-error": "downloadit-error-aria2-rpc",
  "aria2-partial-failure": "downloadit-error-aria2-partial",
  "aria2-autostart-local-only": "downloadit-error-aria2-local",
  "aria2-start-timeout": "downloadit-error-aria2-start-timeout",
  "jdownloader-endpoint-invalid": "downloadit-error-jdownloader-endpoint",
  "jdownloader-unavailable": "downloadit-error-jdownloader-unavailable",
  "jdownloader-discovery-invalid": "downloadit-error-jdownloader-discovery",
  "jdownloader-http-error": "downloadit-error-jdownloader-http",
  "jdownloader-launch-path-invalid": "downloadit-error-jdownloader-path",
  "jdownloader-launch-failed": "downloadit-error-jdownloader-launch",
  "jdownloader-start-timeout": "downloadit-error-jdownloader-start-timeout",
  "jdownloader-submit-failed": "downloadit-error-jdownloader-submit",
  "jdownloader-mixed-post-data": "downloadit-error-jdownloader-mixed-post",
  "abdm-endpoint-invalid": "downloadit-error-abdm-endpoint",
  "abdm-api-key-invalid": "downloadit-error-abdm-api-key",
  "abdm-unavailable": "downloadit-error-abdm-unavailable",
  "abdm-http-error": "downloadit-error-abdm-http",
  "abdm-response-invalid": "downloadit-error-abdm-response",
  "abdm-submit-failed": "downloadit-error-abdm-submit",
  "abdm-post-unsupported": "downloadit-error-abdm-post",
  "abdm-launch-path-invalid": "downloadit-error-abdm-path",
  "abdm-launch-failed": "downloadit-error-abdm-launch",
  "abdm-start-timeout": "downloadit-error-abdm-start-timeout",
  "xdm-unavailable": "downloadit-error-xdm-unavailable",
  "xdm-disabled": "downloadit-error-xdm-disabled",
  "xdm-http-error": "downloadit-error-xdm-http",
  "xdm-response-invalid": "downloadit-error-xdm-response",
  "xdm-submit-failed": "downloadit-error-xdm-submit",
  "xdm-post-unsupported": "downloadit-error-xdm-post",
  "xdm-launch-path-invalid": "downloadit-error-xdm-path",
  "xdm-launch-failed": "downloadit-error-xdm-launch",
  "xdm-start-timeout": "downloadit-error-xdm-start-timeout",
  "uget-unavailable": "downloadit-error-uget-unavailable",
  "uget-launch-path-invalid": "downloadit-error-uget-path",
  "uget-launch-failed": "downloadit-error-uget-launch",
  "uget-submit-failed": "downloadit-error-uget-submit",
  "uget-partial-failure": "downloadit-error-uget-partial",
  "aria2next-unavailable": "downloadit-error-aria2next-unavailable",
  "aria2next-platform-unsupported": "downloadit-error-aria2next-platform",
  "aria2next-rpc-error": "downloadit-error-aria2next-rpc",
  "aria2next-start-timeout": "downloadit-error-aria2next-start-timeout",
  "aria2next-submit-failed": "downloadit-error-aria2next-submit",
  "aria2next-partial-failure": "downloadit-error-aria2next-partial",
};

function bindingAbortedResult () {
  if (typeof Cr !== "undefined") {
    return Cr.NS_BINDING_ABORTED;
  }
  if (typeof Components !== "undefined") {
    return Components.results.NS_BINDING_ABORTED;
  }
  return undefined;
}

export function getLauncherExtension (launcher) {
  const filename = String(launcher?.suggestedFileName || "").trim();
  const separator = filename.lastIndexOf(".");
  if (separator <= 0 || separator === filename.length - 1) {
    return "";
  }
  return normalizeAutoExtensions([filename.slice(separator + 1)])[0] || "";
}

function classifyLauncherTarget(launcher) {
  const mimeInfo = launcher?.MIMEInfo;
  return classifyDownloadTarget({
    url: launcher?.source?.spec || "",
    filename: launcher?.suggestedFileName || launcher?.targetFile?.leafName || "",
    mimeType: mimeInfo?.MIMEType || mimeInfo?.type || "",
    primaryExtension: mimeInfo?.primaryExtension || "",
  });
}

export function canRememberLauncherExtension (launcher) {
  const extension = getLauncherExtension(launcher);
  return Boolean(
    extension &&
    classifyLauncherTarget(launcher) ===
      DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED,
  );
}

function launcherAutoCaptureDisposition(service, launcher) {
  const extension = getLauncherExtension(launcher);
  if (
    !extension ||
    classifyLauncherTarget(launcher) !==
      DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED
  ) {
    return "deny";
  }
  if (typeof service?.getAutoCaptureDisposition === "function") {
    return service.getAutoCaptureDisposition(extension);
  }
  if (service?.autoCaptureRules) {
    return getAutoCaptureDisposition(service.autoCaptureRules, extension);
  }
  return service?.hasAutoExtension?.(extension) ? "allow" : "default";
}

function shouldAutomaticallyHandle (service, launcher) {
  try {
    const protocol = String(launcher?.source?.spec || "")
      .split(":", 1)[0]
      .toLowerCase();
    if (protocol === "magnet" || protocol === "ed2k") {
      return typeof service?.getProtocolDefaultManager === "function" &&
        Boolean(service.getProtocolDefaultManager(protocol));
    }
    const extension = getLauncherExtension(launcher);
    return Boolean(
      service?.defaultManager &&
      service.defaultDownloader?.ref?.provider !== "native" &&
      classifyLauncherTarget(launcher) ===
        DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED &&
      extension &&
      launcherAutoCaptureDisposition(service, launcher) === "allow",
    );
  } catch (error) {
    console.error("DownloadIt: automatic extension check failed", error);
    return false;
  }
}

function startAutomaticDownload ({
  state,
  launcher,
  context,
  fallback,
  complete,
}) {
  const service = state.service;
  if (!shouldAutomaticallyHandle(service, launcher)) {
    return false;
  }
  if (state.pendingLaunchers.has(launcher)) {
    return true;
  }

  state.pendingLaunchers.add(launcher);
  const protocol = String(launcher?.source?.spec || "")
    .split(":", 1)[0]
    .toLowerCase();
  const manager = (protocol === "magnet" || protocol === "ed2k")
    ? service.getProtocolDefaultManager(protocol)
    : service.defaultManager;
  Promise.resolve().then(() => service.downloadLauncher({
    launcher,
    context,
    manager,
    filename: launcher.suggestedFileName || "",
  })).then(() => {
    try {
      complete();
    } catch (error) {
      console.error("DownloadIt: automatic launcher completion failed", error);
    }
  }, error => {
    state.pendingLaunchers.delete(launcher);
    console.error("DownloadIt: automatic download failed; showing Firefox UI", error);
    try {
      fallback();
    } catch (fallbackError) {
      console.error("DownloadIt: Firefox fallback failed", fallbackError);
    }
  });
  return true;
}

export function registerDownloadItHelperAppHook (
  service,
  { helperDialogConstructor = null } = {},
) {
  if (helperAppHook) {
    helperAppHook.service = service;
    return true;
  }

  let constructor = helperDialogConstructor;
  if (!constructor) {
    try {
      constructor = ChromeUtils.importESModule(
        HELPER_APP_DIALOG_MODULE,
      ).nsUnknownContentTypeDialog;
    } catch (error) {
      console.error("DownloadIt: Firefox helper-app module is unavailable", error);
      return false;
    }
  }

  const prototype = constructor?.prototype;
  if (typeof prototype?.show !== "function") {
    console.error("DownloadIt: Firefox helper-app show hook is unavailable");
    return false;
  }

  const state = {
    service,
    prototype,
    originalShow: prototype.show,
    originalPromptForSaveToFileAsync:
      typeof prototype.promptForSaveToFileAsync === "function"
        ? prototype.promptForSaveToFileAsync
        : null,
    wrappedShow: null,
    wrappedPromptForSaveToFileAsync: null,
    pendingLaunchers: new WeakSet(),
    nativeSaveFilenames: new WeakMap(),
  };

  try {
    state.wrappedShow = function (...args) {
      const [launcher, context] = args;
      const handled = startAutomaticDownload({
        state,
        launcher,
        context,
        fallback: () => state.originalShow.apply(this, args),
        complete: () => launcher.cancel(bindingAbortedResult()),
      });
      if (!handled) {
        return state.originalShow.apply(this, args);
      }
      return undefined;
    };
    prototype.show = state.wrappedShow;

    if (state.originalPromptForSaveToFileAsync) {
      state.wrappedPromptForSaveToFileAsync = function (...args) {
        const [launcher, context, , , forcePrompt] = args;
        if (state.nativeSaveFilenames.has(launcher)) {
          args[2] = state.nativeSaveFilenames.get(launcher);
          state.nativeSaveFilenames.delete(launcher);
          // The native launcher requests its destination after the prompt has
          // closed. Preserve the user's explicit Save choice and edited name.
          return state.originalPromptForSaveToFileAsync.apply(this, args);
        }
        const handled = !forcePrompt && !this.mDialog && startAutomaticDownload({
          state,
          launcher,
          context,
          fallback: () => state.originalPromptForSaveToFileAsync.apply(this, args),
          complete: () => launcher.saveDestinationAvailable(null),
        });
        if (!handled) {
          return state.originalPromptForSaveToFileAsync.apply(this, args);
        }
        return undefined;
      };
      prototype.promptForSaveToFileAsync = state.wrappedPromptForSaveToFileAsync;
    }
  } catch (error) {
    if (prototype.show === state.wrappedShow) {
      prototype.show = state.originalShow;
    }
    if (
      state.wrappedPromptForSaveToFileAsync &&
      prototype.promptForSaveToFileAsync === state.wrappedPromptForSaveToFileAsync
    ) {
      prototype.promptForSaveToFileAsync = state.originalPromptForSaveToFileAsync;
    }
    console.error("DownloadIt: Firefox helper-app hook registration failed", error);
    return false;
  }

  helperAppHook = state;
  return true;
}

export function unregisterDownloadItHelperAppHook (service) {
  const state = helperAppHook;
  if (!state || (service && state.service !== service)) {
    return;
  }

  state.service = null;
  if (state.prototype.show === state.wrappedShow) {
    state.prototype.show = state.originalShow;
  }
  if (
    state.wrappedPromptForSaveToFileAsync &&
    state.prototype.promptForSaveToFileAsync === state.wrappedPromptForSaveToFileAsync
  ) {
    state.prototype.promptForSaveToFileAsync = state.originalPromptForSaveToFileAsync;
  }
  helperAppHook = null;
}

function documentURL (window) {
  return String(window?.location?.href || "").replace(/\?.*$/, "");
}

export function isDownloadDialogWindow (window) {
  return documentURL(window) === DOWNLOAD_DIALOG_URL;
}

export class DownloadItDownloadDialogController {
  constructor(service, window, initializeLocalization) {
    this.service = service;
    this.window = window;
    this.document = window.document;
    this.initializeLocalization = initializeLocalization;
    this.localizationReady = Promise.resolve();
    this.dialog = null;
    this.mode = null;
    this.option = null;
    this.radio = null;
    this.manager = null;
    this.managerPopup = null;
    this.action = null;
    this.rememberChoice = null;
    this.rememberChoiceState = null;
    this.downloadItModeActive = false;
    this.availableManagers = [];
    this.defaultManager = "";
    this.defaultManagerLabel = "";
    this.originalOnOK = null;
    this.nativeLayoutState = [];
    this.nativePropertyState = [];
    this.saveOnlyLayout = false;
    this.submitting = false;
    this.initialized = false;
    this.destroyed = false;
    this.featureControls = null;
    this.encodingMenu = null;
    this.linkRow = null;
    this.copyFeedbackTimer = null;
    this.copyFeedbackAnimation = null;
    this.quickActions = null;
    this.locationElement = null;
    this.filenameInput = null;
    this.filenameRow = null;
    this.quickActionElements = [];
  }

  async init () {
    if (this.initialized || !isDownloadDialogWindow(this.window)) {
      return false;
    }

    const dialog = this.window.dialog;
    const launcher = dialog?.mLauncher;
    const mode = this.document.getElementById(MODE_ID);
    if (
      !dialog ||
      !launcher ||
      classifyLauncherTarget(launcher) !==
        DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED ||
      !mode
    ) {
      return false;
    }

    this.dialog = dialog;
    this.rememberChoice = this.document.getElementById(REMEMBER_CHOICE_ID);
    if (this.rememberChoice) {
      this.rememberChoiceState = {
        checked: Boolean(this.rememberChoice.checked),
        disabled: Boolean(this.rememberChoice.disabled),
      };
    }
    this.localizationReady = Promise.resolve(
      this.initializeLocalization?.(this.window),
    );

    let managers = [];
    try {
      managers = await this.service.getManagersForDownloadDialog();
    } catch (error) {
      console.error("DownloadIt: download dialog manager scan failed", error);
    }
    if (this.destroyed) {
      return false;
    }
    managers = Array.isArray(managers) ? managers : [];

    await this.localizationReady;
    if (this.destroyed || !this.document.l10n) {
      return false;
    }

    if (managers.length) {
      await this.buildOption(mode, managers);
    }
    await this.buildDownloadFeatures();
    if (this.destroyed) {
      return false;
    }
    this.revealDownloadChoices();
    this.window.sizeToContent?.();
    this.wrapOKHandler();
    this.initialized = true;
    return true;
  }

  destroy () {
    this.destroyed = true;
    this.window.clearTimeout?.(this.copyFeedbackTimer);
    this.copyFeedbackTimer = null;
    this.copyFeedbackAnimation?.cancel();
    this.copyFeedbackAnimation = null;
    if (this.dialog && this.dialog.onOK === this.onOK) {
      this.dialog.onOK = this.originalOnOK;
    }
    this.managerPopup?.removeEventListener("popupshowing", this);
    this.mode?.removeEventListener("select", this);
    this.option?.remove();
    this.filenameRow?.remove();
    this.filenameInput?.remove();
    this.featureControls?.remove();
    this.linkRow?.remove();
    this.quickActions?.remove?.();
    this.restoreNativeLayout();
    this.dialog = null;
    this.mode = null;
    this.option = null;
    this.radio = null;
    this.manager = null;
    this.managerPopup = null;
    this.action = null;
    this.restoreRememberChoiceState();
    this.rememberChoice = null;
    this.rememberChoiceState = null;
    this.downloadItModeActive = false;
    this.availableManagers = [];
    this.defaultManager = "";
    this.defaultManagerLabel = "";
    this.originalOnOK = null;
    this.saveOnlyLayout = false;
    this.submitting = false;
    this.initialized = false;
    this.featureControls = null;
    this.encodingMenu = null;
    this.linkRow = null;
    this.quickActions = null;
    this.locationElement = null;
    this.filenameInput = null;
    this.filenameRow = null;
    for (const element of this.quickActionElements) element.remove();
    this.quickActionElements = [];
  }

  async buildOption (mode, managers) {
    const document = this.document;
    managers = managers.map(normalizeDownloader);
    const defaultManager = this.service.defaultManager || managers[0]?.key || "";
    const defaultDownloader = managers.find(
      downloader => downloader.key === defaultManager,
    ) || managers[0];
    const defaultManagerLabel = await this.formatMessage(
      defaultDownloader?.custom
        ? "downloadit-download-dialog-custom-default-manager"
        : "downloadit-download-dialog-default-manager",
      { manager: defaultDownloader?.name || defaultManager },
    );
    const managerAriaLabel = await this.formatMessage(
      "downloadit-download-dialog-manager",
    );
    this.availableManagers = [...managers];
    this.defaultManager = defaultManager;
    this.defaultManagerLabel = defaultManagerLabel;
    this.mode = mode;
    this.mode.addEventListener("select", this);

    this.radio = createXULElement(document, "radio", {
      id: "downloadit-download-radio",
      style: "flex: 0 0 auto; white-space: nowrap;",
    });
    this.setLocalized(this.radio, "downloadit-download-dialog-option");
    this.radio.addEventListener("command", () => this.updateModeState());
    this.radio.addEventListener("dblclick", () => this.submitExternal());

    this.managerPopup = this.createManagerPopup();
    this.manager = createXULElement(document, "menulist", {
      id: DOWNLOADIT_MANAGER_ID,
      label: defaultManagerLabel,
      manager: defaultManager,
      "aria-label": managerAriaLabel,
      flex: "1",
      native: true,
      crop: "end",
      // The selected label must not determine the row's minimum width.
      style: "flex: 1 1 0%; min-width: 0 !important; width: 0; min-height: var(--button-min-height-small, 28px) !important; max-height: var(--button-min-height-small, 28px) !important;",
    }, [this.managerPopup]);

    this.action = createXULElement(document, "toolbarbutton", {
      id: DOWNLOADIT_ACTION_ID,
      class: "toolbarbutton-1",
      image: "chrome://downloadit/content/icons/downloadit.svg",
      style: "flex: 0 0 auto;",
    });
    this.setLocalized(this.action, "downloadit-download-dialog-action");
    this.action.addEventListener("command", () => {
      this.radio.click();
      this.submitExternal();
    });

    const controls = createXULElement(document, "hbox", {
      align: "center",
      flex: "1",
      style: "flex: 1 1 0%; min-width: 0;",
    }, [this.manager, this.action]);
    const deck = createXULElement(document, "deck", {
      id: "downloadit-download-deck",
      flex: "1",
      style: "flex: 1 1 0%; min-width: 0;",
    }, [controls]);
    this.option = createXULElement(document, "hbox", {
      id: DOWNLOADIT_OPTION_ID,
      align: "center",
      style: "min-width: 0;",
    }, [this.radio, deck]);
    mode.appendChild(this.option);
    await this.translateFragment(this.option);
  }

  async buildDownloadFeatures() {
    const settings = this.service.getDownloadDialogSettings?.() || {};
    const launcher = this.dialog.mLauncher;
    const location = this.document.getElementById("location");
    this.locationElement = location;
    const sourceElement = this.document.getElementById("source");
    const source = String(launcher.source?.spec || "");
    const hasServerFilename = this.launcherHasServerFilename(launcher);
    const rawURLFilename = getURLFilenameCandidate(source);
    const detection = !hasServerFilename && rawURLFilename
      ? getFilenameEncodingCandidates(
          rawURLFilename,
          this.window.Services?.locale?.appLocaleAsBCP47 || "",
          settings.filenameEncodings || [],
        )
      : null;
    const filename = hasServerFilename
      ? String(launcher.suggestedFileName || "")
      : detection && settings.detectFilenameEncoding !== false
        ? detection.detected
        : String(launcher.suggestedFileName || "");

    if (location) {
      if (filename && !hasServerFilename && settings.detectFilenameEncoding !== false) {
        location.value = filename;
      }
      if (settings.editFilename !== false) {
        this.filenameRow = createXULElement(this.document, "hbox", {
          id: "di-filename-row",
          align: "center",
          flex: "1",
          style: "min-width: 0; width: 100%;",
        });
        this.filenameInput = this.document.createElementNS
          ? this.document.createElementNS("http://www.w3.org/1999/xhtml", "input")
          : createXULElement(this.document, "textbox");
        this.filenameInput.setAttribute("id", "locationText");
        this.filenameInput.setAttribute(
          "style",
          "display: block; flex: 1 1 0%; min-width: 0; width: 100%; max-width: 100%; border: 1px solid var(--in-content-box-border-color, ThreeDDarkShadow); border-radius: 4px; padding-inline: 5px; min-height: 24px; max-height: 24px; box-sizing: border-box;",
        );
        this.filenameInput.value = filename || location.value || "";
        this.filenameRow.appendChild(this.filenameInput);
        this.setTemporaryAttribute(location, "hidden", "true");
        location.after?.(this.filenameRow);
        if (!location.after) location.parentNode?.appendChild(this.filenameRow);
      } else {
        this.setTemporaryProperty(location, "disabled", true);
      }
    }

    const parent = sourceElement?.parentNode;
    if (settings.showFullURL !== false && source && parent) {
      this.linkRow = createXULElement(this.document, "hbox", {
        id: "di-complete-link-row",
        align: "center",
        flex: "1",
        style: "min-width: 0; max-width: 100%; overflow: hidden;",
      });
      const linkLabel = createXULElement(this.document, "label", {});
      this.setLocalized(linkLabel, "downloadit-dialog-complete-link-label");
      const fullLink = createXULElement(this.document, "description", {
        id: "di-complete-link",
        flex: "1",
        crop: "center",
        value: source,
        "tooltiptext": source,
        style: "min-width: 0 !important; width: 0px !important; max-width: 100%; overflow: hidden;",
      });
      const copy = createXULElement(this.document, "button", {
        id: "di-copy-link",
        class: "dialog-button",
        style: "flex: 0 0 auto; min-width: 0 !important; width: fit-content;",
        "aria-live": "polite",
        "aria-atomic": "true",
      });
      this.setLocalized(copy, "downloadit-dialog-copy-link");
      copy.addEventListener("command", () => this.copyLink(source));
      this.linkRow.append(linkLabel, fullLink, copy);
      parent.after?.(this.linkRow);
      if (!parent.after) parent.appendChild(this.linkRow);
      await this.translateFragment(this.linkRow);
    }

    if (!location) return;
    if (!hasServerFilename && rawURLFilename) {
      const popup = createXULElement(this.document, "menupopup", {
        id: "di-filename-encoding-popup",
      });
      this.encodingMenu = createXULElement(this.document, "button", {
        id: "di-filename-encoding", type: "menu",
        style: "flex-shrink: 0; min-width: max-content; margin-inline-start: 4px;",
      }, [popup]);
      this.setLocalized(this.encodingMenu, "downloadit-dialog-encoding-button", {
        mode: settings.detectFilenameEncoding === false ? "original" : "auto",
        encoding: detection.encoding,
      });
      const automatic = createXULElement(this.document, "menuitem", { value: "auto" });
      this.setLocalized(automatic, "downloadit-dialog-encoding-auto");
      popup.appendChild(automatic);
      const original = createXULElement(this.document, "menuitem", { value: "original" });
      this.setLocalized(original, "downloadit-dialog-encoding-original");
      popup.appendChild(original);
      const labels = ["UTF-8", ...FILENAME_ENCODINGS, ...(settings.filenameEncodings || [])];
      const seen = new Set();
      for (const encoding of labels) {
        let canonical;
        try { canonical = new TextDecoder(encoding).encoding; } catch { continue; }
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        const value = decodeURLFilename(rawURLFilename, encoding);
        const item = createXULElement(this.document, "menuitem", { value: encoding, disabled: !value });
        this.setLocalized(item, "downloadit-dialog-encoding-choice", { encoding });
        popup.appendChild(item);
      }
      popup.addEventListener("command", event => {
        if (event.target?.localName !== "menuitem" || event.target.disabled) return;
        const encoding = event.target.getAttribute("value");
        const value = encoding === "auto" ? detection.detected
          : encoding === "original" ? String(launcher.suggestedFileName || detection.original)
          : decodeURLFilename(rawURLFilename, encoding);
        if (!value) return;
        (this.filenameInput || location).value = value;
        this.setLocalized(this.encodingMenu, "downloadit-dialog-encoding-button", {
          mode: encoding === "auto" || encoding === "original" ? encoding : "manual",
          encoding: encoding === "auto" ? detection.encoding : encoding,
        });
      });
      const parent = this.filenameInput?.parentNode || location.parentNode;
      parent.appendChild(this.encodingMenu);
      this.featureControls = this.encodingMenu;
      await this.translateFragment(this.encodingMenu);
    }

    await this.buildQuickActions(settings);
  }

  launcherHasServerFilename(launcher) {
    const channel = launcher?.channel;
    if (channel?.contentDispositionFilename) return true;
    let header = String(channel?.contentDispositionHeader || "");
    if (!header) {
      try {
        const httpChannel = channel.QueryInterface(
          this.window.Components.interfaces.nsIHttpChannel,
        );
        header = httpChannel.getResponseHeader("Content-Disposition");
      } catch {}
    }
    return /(?:^|;)\s*filename\*?\s*=/i.test(header);
  }

  copyLink(value) {
    if (this.destroyed) return;
    let succeeded = false;
    try {
      const { classes: Cc, interfaces: Ci } = this.window.Components;
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper).copyString(value);
      succeeded = true;
    } catch (error) {
      console.error("DownloadIt: could not copy download URL", error);
    }
    const button = this.document.getElementById("di-copy-link");
    if (!button) return;
    this.window.clearTimeout(this.copyFeedbackTimer);
    this.copyFeedbackAnimation?.cancel();
    this.copyFeedbackAnimation = null;
    this.setLocalized(button, succeeded
      ? "downloadit-dialog-copy-link-success"
      : "downloadit-dialog-copy-link-failed");
    if (!this.window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.copyFeedbackAnimation = button.animate?.(
        succeeded
          ? [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }]
          : [
              { transform: "translateX(0)" },
              { transform: "translateX(-3px)" },
              { transform: "translateX(3px)" },
              { transform: "translateX(0)" },
            ],
        { duration: 240, easing: "ease-out" },
      );
    }
    this.copyFeedbackTimer = this.window.setTimeout(() => {
      this.copyFeedbackTimer = null;
      if (!this.destroyed) this.setLocalized(button, "downloadit-dialog-copy-link");
    }, 2500);
  }

  async buildQuickActions(settings) {
    const launcher = this.dialog.mLauncher;
    const frame = this.document.getElementById("unknownContentType") ||
      this.document.documentElement;
    const anchor = frame?.getButton?.("extra2") || frame?.getButton?.("accept");
    const fallback = this.document.getElementById(NORMAL_BOX_ID);
    const buttonParent = anchor?.parentNode || fallback;
    if (!buttonParent) return;
    const actions = [];
    const add = (id, messageId, callback) => {
      const button = createXULElement(this.document, "button", {
        id,
        class: "dialog-button",
        part: "dialog-button",
        size: "small",
      });
      this.setLocalized(button, messageId);
      button.addEventListener("command", callback);
      actions.push(button);
    };
    if (settings.saveAs !== false) {
      add("di-save-as", "downloadit-dialog-save-as", () => this.saveAs());
    }
    if (settings.saveTo !== false) {
      const popup = createXULElement(this.document, "menupopup", {
        id: "di-save-to-popup",
      });
      this.addNativeMenuStyles(popup);
      const os = this.window.Services?.appinfo?.OS || globalThis.Services?.appinfo?.OS;
      const directories = settings.directories || [];
      const entries = resolveDownloadDirectories(directories, this.window.Components, os);
      if (settings.listUncoveredDrives) {
        entries.push(...getUncoveredWindowsDrives(directories, this.window.Components, os));
      }
      for (const entry of entries) {
        const item = createXULElement(this.document, "menuitem", {
          value: entry.path,
          dir: entry.path,
          image: `moz-icon:file:///${entry.path}\\`,
          class: "menuitem-iconic",
        });
        if (entry.messageId) {
          this.setLocalized(item, entry.messageId);
        } else {
          item.setAttribute("label", entry.label || entry.path);
        }
        item.addEventListener("command", () => this.saveTo(entry.path));
        popup.appendChild(item);
      }
      await this.translateFragment(popup);
      const menu = createXULElement(this.document, "button", {
        id: "di-save-to",
        type: "menu",
        class: "dialog-button",
        part: "dialog-button",
        size: "small",
        native: "true",
      }, [popup]);
      this.setLocalized(menu, "downloadit-dialog-save-to");
      actions.push({ element: menu, anchor: frame?.getButton?.("cancel") || anchor });
    }
    if (settings.saveAndOpen !== false) {
      add("di-save-and-open", "downloadit-dialog-save-and-open", () => this.saveAndOpen());
    }
    if (!actions.length) return;
    this.quickActionElements = actions.map(action => action.element || action);
    this.quickActions = this.quickActionElements;
    for (const action of actions) {
      const button = action.element || action;
      const target = action.anchor || anchor;
      if (target?.parentNode) target.parentNode.insertBefore(button, target);
      else buttonParent.appendChild(button);
      await this.translateFragment(button);
    }
    await this.addQuickActionStyles(this.quickActionElements[0]);
  }

  addQuickActionStyles(element) {
    const root = element.getRootNode();
    if (!root?.host || root.querySelector("link[data-downloadit-dialog-style]")) {
      return;
    }
    const link = this.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "link",
    );
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", "chrome://downloadit/content/download-dialog.css");
    link.setAttribute("data-downloadit-dialog-style", "true");
    const ready = new Promise(resolve => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", resolve, { once: true });
    });
    root.appendChild(link);
    return ready;
  }

  addNativeMenuStyles(popup) {
    if (!this.document.createElementNS) return;
    for (const href of [
      "chrome://global/skin/global.css",
      "chrome://global/content/elements/menupopup.css",
    ]) {
      const link = this.document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "link",
      );
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", href);
      popup.appendChild(link);
    }
  }

  prepareLauncherSave() {
    const launcher = this.dialog.mLauncher;
    if (launcher.MIMEInfo && this.window.Components?.interfaces?.nsIMIMEInfo) {
      launcher.MIMEInfo.preferredAction =
        this.window.Components.interfaces.nsIMIMEInfo.saveToDisk;
    }
    try { launcher.setWebProgressListener(null); } catch {}
    this.dialog.onCancel = function () { this.onUnload?.(); };
  }

  async saveAndOpen() {
    try {
      this.syncFilenameToNativeField();
      const launcher = this.dialog.mLauncher;
      if (launcher.targetFileIsExecutable) {
        // Firefox disables the Open radio in its save-only layout. Use the
        // native launcher directly; Firefox still handles download security
        // checks and the confirmation before launching an executable.
        launcher.setWebProgressListener(null);
        launcher.setDownloadToLaunch(false, null);
        this.dialog.onUnload();
      } else {
        const open = this.document.getElementById("open");
        if (!open || open.disabled) return;
        open.click();
        this.originalOnOK?.call(this.dialog);
      }
      this.window.close();
    } catch (error) {
      await this.showSaveError(error);
    }
  }

  async saveAs() {
    try {
      const filename = this.getFilename();
      this.prepareLauncherSave();
      this.dialog.promptForSaveToFileAsync(
        this.dialog.mLauncher,
        this.dialog.mContext,
        filename,
        null,
        true,
      );
      this.window.close();
    } catch (error) {
      await this.showSaveError(error);
    }
  }

  async saveTo(directory) {
    try {
      const { classes: Cc, interfaces: Ci } = this.window.Components;
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(directory);
      if (!file.exists() || !file.isDirectory()) {
        throw new Error("The configured download folder is unavailable");
      }
      file.append(String(this.getFilename()).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "download");
      this.prepareLauncherSave();
      this.dialog.mLauncher.saveDestinationAvailable(file);
      this.window.close();
    } catch (error) {
      await this.showSaveError(error);
    }
  }

  async showSaveError(error) {
    const message = await this.formatMessage("downloadit-dialog-action-failed", {
      error: error?.message || String(error),
    });
    this.service.alert(this.window, message);
  }

  saveNative() {
    const save = this.document.getElementById("save");
    if (save) save.click();
    this.acceptNative();
  }

  acceptNative(...args) {
    this.syncFilenameToNativeField();
    if (this.document.getElementById("save")?.selected && helperAppHook) {
      helperAppHook.nativeSaveFilenames.set(this.dialog.mLauncher, this.getFilename());
    }
    return this.originalOnOK?.apply(this.dialog, args);
  }

  syncFilenameToNativeField() {
    if (this.filenameInput && this.locationElement) {
      this.locationElement.value = this.filenameInput.value;
    }
  }

  createManagerPopup () {
    const popup = createXULElement(this.document, "menupopup", {
      id: DOWNLOADIT_MANAGER_POPUP_ID,
    });
    popup.addEventListener("popupshowing", this);
    return popup;
  }

  revealDownloadChoices () {
    const normalBox = this.document.getElementById(NORMAL_BOX_ID);
    const basicBox = this.document.getElementById(BASIC_BOX_ID);
    if (!normalBox?.collapsed || !basicBox) {
      return;
    }

    // Firefox collapses the entire action group for executable and other
    // save-only downloads. Reveal it while keeping unsafe actions disabled.
    this.saveOnlyLayout = true;
    this.setTemporaryAttribute(normalBox, "collapsed", null);
    this.setTemporaryAttribute(basicBox, "collapsed", "true");

    for (const id of ["open", "openHandler", "chooseButton"]) {
      const element = this.document.getElementById(id);
      if (element) {
        this.setTemporaryAttribute(element, "disabled", "true");
      }
    }

  }

  setTemporaryAttribute (element, name, value) {
    this.nativeLayoutState.push({
      element,
      name,
      value: element.getAttribute(name),
    });
    if (value === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  setTemporaryProperty (element, name, value) {
    this.nativePropertyState.push({
      element,
      name,
      value: element[name],
    });
    element[name] = value;
  }

  restoreNativeLayout () {
    for (const { element, name, value } of this.nativeLayoutState.reverse()) {
      if (value === null) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, value);
      }
    }
    this.nativeLayoutState = [];
    for (const { element, name, value } of this.nativePropertyState.reverse()) {
      element[name] = value;
    }
    this.nativePropertyState = [];
  }

  populateManagerPopup () {
    const currentManagers = this.service.downloadDialogManagers ??
      this.service.managers;
    const managers = (currentManagers?.length
      ? [...currentManagers]
      : [...this.availableManagers]).map(normalizeDownloader);
    this.managerPopup.replaceChildren();
    for (const downloader of managers) {
      const isDefault = downloader.key === this.defaultManager;
      const item = createXULElement(this.document, "menuitem", {
        label: isDefault
          ? this.defaultManagerLabel
          : downloader.name,
        value: downloader.key,
        manager: downloader.key,
      });
      item.downloadItManagerKey = downloader.key;
      if (downloader.custom && !isDefault) {
        this.setLocalized(item, "downloadit-custom-downloader-menu-label", {
          name: downloader.name,
        });
      }
      if (isDefault) {
        item.setAttribute("default", "true");
      }
      item.addEventListener("command", event => this.handleManagerCommand(event));
      this.managerPopup.appendChild(item);
    }
    Promise.resolve(this.document.l10n?.translateFragment?.(this.managerPopup)).catch(
      error => console.error("DownloadIt: download manager translation failed", error),
    );
  }

  handleManagerCommand (event) {
    const target = event.currentTarget || event.target;
    const manager = target?.downloadItManagerKey;
    if (!manager) {
      return;
    }
    for (const item of target.parentNode?.children || []) {
      item.removeAttribute("selected");
    }
    this.manager.setAttribute("label", target.getAttribute("label") || manager);
    this.manager.setAttribute("manager", manager);
    target.setAttribute("selected", "true");
    this.radio.click();
  }

  handleEvent (event) {
    if (event.type === "select" && event.target === this.mode) {
      this.updateModeState();
      return;
    }
    if (event.type === "popupshowing" && event.target === this.managerPopup) {
      this.populateManagerPopup();
    }
  }

  updateModeState () {
    const rememberChoice = this.rememberChoice;
    if (this.radio?.selected) {
      if (rememberChoice) {
        const extension = getLauncherExtension(this.dialog?.mLauncher);
        const canRemember = canRememberLauncherExtension(this.dialog?.mLauncher);
        const canEdit = canRemember && !this.service.autoCaptureRulesLoadError;
        if (!this.downloadItModeActive) {
          rememberChoice.checked = canRemember &&
            launcherAutoCaptureDisposition(
              this.service,
              this.dialog?.mLauncher,
            ) === "allow";
        }
        rememberChoice.disabled = !canEdit;
        if (!canRemember) {
          rememberChoice.checked = false;
        }
      }
      this.downloadItModeActive = true;
      const accept = this.getAcceptButton();
      if (accept) {
        accept.disabled = false;
      }
    } else {
      if (this.downloadItModeActive) {
        this.restoreRememberChoiceState();
      }
      this.downloadItModeActive = false;
    }
  }

  restoreRememberChoiceState () {
    if (!this.rememberChoice || !this.rememberChoiceState) {
      return;
    }
    this.rememberChoice.checked = this.rememberChoiceState.checked;
    this.rememberChoice.disabled = this.rememberChoiceState.disabled;
  }

  getAcceptButton () {
    return this.document.getElementById("unknownContentType")?.getButton?.("accept") ||
      this.document.documentElement?.getButton?.("accept") ||
      null;
  }

  wrapOKHandler () {
    this.originalOnOK = this.dialog.onOK;
    this.onOK = (...args) => {
      if (!this.radio?.selected) {
        return this.acceptNative(...args);
      }
      args[0]?.preventDefault?.();
      this.action.click();
      return false;
    };
    this.dialog.onOK = this.onOK;
  }

  getFilename () {
    const location = this.filenameInput || this.document.getElementById("location");
    return location?.value || this.dialog?.mLauncher?.suggestedFileName || "";
  }

  async submitExternal () {
    const manager = this.manager?.getAttribute("manager");
    if (this.submitting || !this.radio?.selected || !manager) {
      return;
    }

    this.submitting = true;
    this.action.disabled = true;
    this.manager.disabled = true;
    try {
      await this.service.downloadLauncher({
        launcher: this.dialog.mLauncher,
        context: this.dialog.mContext,
        dialogWindow: this.window,
        manager,
        filename: this.getFilename(),
      });
      if (
        this.rememberChoice &&
        !this.service.autoCaptureRulesLoadError &&
        canRememberLauncherExtension(this.dialog.mLauncher)
      ) {
        try {
          const extension = getLauncherExtension(this.dialog.mLauncher);
          const current = launcherAutoCaptureDisposition(
            this.service,
            this.dialog.mLauncher,
          );
          const next = this.rememberChoice.checked
            ? "allow"
            : current === "allow" ? "default" : current;
          if (next !== current) {
            if (typeof this.service.setAutoCaptureRule === "function") {
              await this.service.setAutoCaptureRule(extension, next);
            } else {
              await this.service.setAutoExtension?.(extension, next === "allow");
            }
          }
        } catch (error) {
          console.error("DownloadIt: could not update the remembered file type", error);
        }
      }
      this.window.close();
    } catch (error) {
      this.submitting = false;
      this.action.disabled = false;
      this.manager.disabled = false;
      const message = await this.formatMessage(
        "downloadit-download-dialog-failed",
        {
          manager: this.service.resolveDownloader?.(manager)?.name || manager,
          error: await this.formatDownloadError(error),
        },
      );
      this.service.alert(this.window, message);
    }
  }

  setLocalized (element, id, args = null) {
    this.document.l10n?.setAttributes(element, id, args);
  }

  async translateFragment (element) {
    await this.localizationReady;
    if (typeof this.document.l10n?.translateFragment === "function") {
      await this.document.l10n.translateFragment(element);
    }
  }

  async formatMessage (id, args = null) {
    await this.localizationReady;
    const message = args == null
      ? await this.document.l10n?.formatValue(id)
      : await this.document.l10n?.formatValue(id, args);
    return message || id;
  }

  async formatDownloadError (error) {
    const id = DOWNLOAD_ERROR_MESSAGES[error?.code];
    return id
      ? this.formatMessage(id, error.args || null)
      : error?.message || String(error);
  }
}

export { DOWNLOAD_DIALOG_URL };
export { normalizeAutoExtensions };
