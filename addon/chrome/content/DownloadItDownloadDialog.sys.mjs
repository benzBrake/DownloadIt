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

    const rememberChoice = this.document.getElementById(REMEMBER_CHOICE_ID);
    if (rememberChoice) {
      this.setTemporaryAttribute(rememberChoice, "disabled", "true");
      this.setTemporaryProperty(rememberChoice, "checked", false);
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
    const rememberChoice = this.document.getElementById(REMEMBER_CHOICE_ID);
    if (this.radio?.selected) {
      if (rememberChoice) {
        rememberChoice.disabled = true;
        rememberChoice.checked = false;
      }
      const accept = this.getAcceptButton();
      if (accept) {
        accept.disabled = false;
      }
    } else if (rememberChoice) {
      rememberChoice.disabled = this.saveOnlyLayout;
    }
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
