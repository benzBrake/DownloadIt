import { isSupportedURL } from "./DownloadItProtocol.sys.mjs";
import { createXULElement } from "./DownloadItXUL.sys.mjs";

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

function bindingAbortedResult () {
  if (typeof Cr !== "undefined") {
    return Cr.NS_BINDING_ABORTED;
  }
  if (typeof Components !== "undefined") {
    return Components.results.NS_BINDING_ABORTED;
  }
  return undefined;
}

export function normalizeAutoExtensions (value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Automatic download extensions must be an array");
  }

  const extensions = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const extension = entry
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "");
    if (
      !extension ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(extension) ||
      seen.has(extension)
    ) {
      continue;
    }
    seen.add(extension);
    extensions.push(extension);
  }
  return extensions.sort();
}

export function getLauncherExtension (launcher) {
  const filename = String(launcher?.suggestedFileName || "").trim();
  const separator = filename.lastIndexOf(".");
  if (separator <= 0 || separator === filename.length - 1) {
    return "";
  }
  return normalizeAutoExtensions([filename.slice(separator + 1)])[0] || "";
}

export function canRememberLauncherExtension (launcher) {
  const extension = getLauncherExtension(launcher);
  const mimeType = String(
    launcher?.MIMEInfo?.MIMEType || launcher?.MIMEInfo?.type || "",
  ).toLowerCase();
  return Boolean(
    extension &&
    extension !== "xpi" &&
    !mimeType.includes("xpinstall") &&
    isSupportedURL(launcher?.source?.spec || ""),
  );
}

function shouldAutomaticallyHandle (service, launcher) {
  try {
    const extension = getLauncherExtension(launcher);
    return Boolean(
      service?.defaultManager &&
      canRememberLauncherExtension(launcher) &&
      service.hasAutoExtension?.(extension),
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
    const source = launcher?.source?.spec || "";
    const mode = this.document.getElementById(MODE_ID);
    if (!dialog || !launcher || !isSupportedURL(source) || !mode) {
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
    const defaultManager = this.service.defaultManager || managers[0] || "";
    const defaultManagerLabel = await this.formatMessage(
      "downloadit-download-dialog-default-manager",
      { manager: defaultManager },
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
      image: "chrome://browser/skin/downloads/downloads.svg",
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
    const managers = this.service.managers?.length
      ? [...this.service.managers]
      : [...this.availableManagers];
    this.managerPopup.replaceChildren();
    for (const manager of managers) {
      const item = createXULElement(this.document, "menuitem", {
        label: manager === this.defaultManager
          ? this.defaultManagerLabel
          : manager,
        manager,
      });
      if (manager === this.defaultManager) {
        item.setAttribute("default", "true");
      }
      item.addEventListener("command", event => this.handleManagerCommand(event));
      this.managerPopup.appendChild(item);
    }
  }

  handleManagerCommand (event) {
    const target = event.currentTarget || event.target;
    const manager = target?.getAttribute("manager");
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
        const canEdit = canRemember && !this.service.autoExtensionsLocked;
        if (!this.downloadItModeActive) {
          rememberChoice.checked = canRemember &&
            this.service.hasAutoExtension?.(extension);
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
        !this.service.autoExtensionsLocked &&
        canRememberLauncherExtension(this.dialog.mLauncher)
      ) {
        try {
          this.service.setAutoExtension?.(
            getLauncherExtension(this.dialog.mLauncher),
            Boolean(this.rememberChoice?.checked),
          );
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
          manager,
          error: error?.message || String(error),
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
}

export { DOWNLOAD_DIALOG_URL };
