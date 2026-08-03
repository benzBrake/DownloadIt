import {
  classifyDownloadTarget,
  DOWNLOAD_TARGET_CLASSIFICATION,
} from "./DownloadItProtocol.sys.mjs";
import { createXULElement } from "./DownloadItXUL.sys.mjs";
import {
  getAutoCaptureDisposition,
  normalizeAutoExtensions,
} from "./DownloadItAutoCapture.sys.mjs";

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
  const manager = service.defaultManager;
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

    let managers;
    try {
      managers = await this.service.getManagersForDownloadDialog();
    } catch (error) {
      console.error("DownloadIt: download dialog manager scan failed", error);
      return false;
    }
    if (this.destroyed) {
      return false;
    }
    if (!Array.isArray(managers) || managers.length === 0) {
      return false;
    }

    await this.localizationReady;
    if (this.destroyed || !this.document.l10n) {
      return false;
    }

    await this.buildOption(mode, managers);
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
    if (this.dialog && this.dialog.onOK === this.onOK) {
      this.dialog.onOK = this.originalOnOK;
    }
    this.managerPopup?.removeEventListener("popupshowing", this);
    this.mode?.removeEventListener("select", this);
    this.option?.remove();
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
      style: "min-height: var(--button-min-height-small, 28px) !important; max-height: var(--button-min-height-small, 28px) !important;",
    }, [this.managerPopup]);

    this.action = createXULElement(document, "toolbarbutton", {
      id: DOWNLOADIT_ACTION_ID,
      class: "toolbarbutton-1",
      image: "chrome://downloadit/content/icons/downloadit.svg",
    });
    this.setLocalized(this.action, "downloadit-download-dialog-action");
    this.action.addEventListener("command", () => {
      this.radio.click();
      this.submitExternal();
    });

    const controls = createXULElement(document, "hbox", {
      align: "center",
      flex: "1",
    }, [this.manager, this.action]);
    const deck = createXULElement(document, "deck", {
      id: "downloadit-download-deck",
      flex: "1",
    }, [controls]);
    this.option = createXULElement(document, "hbox", {
      id: DOWNLOADIT_OPTION_ID,
    }, [this.radio, deck]);
    mode.appendChild(this.option);
    await this.translateFragment(this.option);
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
        return typeof this.originalOnOK === "function"
          ? this.originalOnOK.apply(this.dialog, args)
          : undefined;
      }
      args[0]?.preventDefault?.();
      this.action.click();
      return false;
    };
    this.dialog.onOK = this.onOK;
  }

  getFilename () {
    const location = this.document.getElementById("location");
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
