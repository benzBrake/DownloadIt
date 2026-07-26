import { createXULElement } from "./DownloadItXUL.sys.mjs";
import { openPageLinksDialog } from "./DownloadItLinks.sys.mjs";

export const DOWNLOADIT_TOOLBAR_WIDGET_ID = "downloadit-toolbar-button";
export const DOWNLOADIT_PANEL_VIEW_ID = "downloadit-panel-view";

const MANAGER_LIST_ID = "downloadit-panel-manager-list";
const STATUS_ID = "downloadit-panel-status";
const LINKS_ID = "downloadit-panel-links";
const REFRESH_ID = "downloadit-panel-refresh";
const SETTINGS_ID = "downloadit-panel-settings";
const STATUS_ICON_ID = "downloadit-panel-status-icon";
const STATUS_TEXT_ID = "downloadit-panel-status-text";
const STYLESHEET_URL = "chrome://downloadit/content/panel.css";

const STATUS_ICONS = Object.freeze({
  error: "chrome://global/skin/icons/error.svg",
  loading: "chrome://global/skin/icons/loading.svg",
  locked: "chrome://global/skin/icons/security.svg",
  success: "chrome://global/skin/icons/check-filled.svg",
});

function findCachedView(document, id) {
  return document.getElementById(id) ||
    document.getElementById("appMenu-viewCache")?.content?.querySelector?.(`#${id}`) ||
    null;
}

export class DownloadItPanelViewController {
  constructor(service, window, initializeLocalization) {
    this.service = service;
    this.window = window;
    this.document = window.document;
    this.initializeLocalization = initializeLocalization;
    this.localizationReady = Promise.resolve();
    this.view = null;
    this.managerList = null;
    this.status = null;
    this.statusIcon = null;
    this.statusText = null;
    this.stylesheetLoaded = false;
    this.linksButton = null;
    this.refreshButton = null;
    this.settingsButton = null;
    this.managerButtons = [];
    this.defaultManagerLocked = false;
    this.refreshPromise = null;
    this.destroyed = false;
  }

  init() {
    const viewCache = this.document.getElementById("appMenu-viewCache");
    if (!viewCache?.content) {
      throw new Error("Firefox application-menu view cache was not found");
    }

    findCachedView(this.document, DOWNLOADIT_PANEL_VIEW_ID)?.remove();
    this.installStylesheet();
    this.localizationReady = Promise.resolve(
      this.initializeLocalization?.(this.window),
    );

    const heading = createXULElement(this.document, "label", {
      id: "downloadit-panel-manager-heading",
      class: "subview-subheader",
      role: "heading",
      "aria-level": "2",
    });
    this.setLocalized(heading, "downloadit-default-manager-title");

    this.managerList = createXULElement(this.document, "vbox", {
      id: MANAGER_LIST_ID,
      role: "radiogroup",
      "aria-labelledby": heading.id,
    });
    this.statusIcon = createXULElement(this.document, "image", {
      id: STATUS_ICON_ID,
      "aria-hidden": "true",
    });
    this.statusText = createXULElement(this.document, "description", {
      id: STATUS_TEXT_ID,
    });
    this.status = createXULElement(this.document, "hbox", {
      id: STATUS_ID,
      hidden: true,
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    }, [this.statusIcon, this.statusText]);
    this.linksButton = createXULElement(this.document, "toolbarbutton", {
      id: LINKS_ID,
      class: "subviewbutton subviewbutton-iconic",
      image: "chrome://browser/skin/downloads/downloads.svg",
    });
    this.setLocalized(this.linksButton, "downloadit-download-links");
    this.refreshButton = createXULElement(this.document, "toolbarbutton", {
      id: REFRESH_ID,
      class: "subviewbutton subviewbutton-iconic",
      closemenu: "none",
      image: "chrome://global/skin/icons/reload.svg",
    });
    this.setLocalized(this.refreshButton, "downloadit-refresh");

    const body = createXULElement(
      this.document,
      "vbox",
      { class: "panel-subview-body" },
      [
        this.linksButton,
        createXULElement(this.document, "toolbarseparator"),
        heading,
        this.managerList,
        this.status,
        createXULElement(this.document, "toolbarseparator"),
        this.refreshButton,
      ],
    );

    this.settingsButton = createXULElement(this.document, "toolbarbutton", {
      id: SETTINGS_ID,
      class: "subviewbutton subviewbutton-iconic panel-subview-footer-button",
      image: "chrome://global/skin/icons/settings.svg",
    });
    this.setLocalized(this.settingsButton, "downloadit-settings");

    this.view = createXULElement(
      this.document,
      "panelview",
      {
        id: DOWNLOADIT_PANEL_VIEW_ID,
        class: "PanelUI-subView",
        "aria-labelledby": heading.id,
      },
      [
        body,
        createXULElement(this.document, "toolbarseparator"),
        this.settingsButton,
      ],
    );
    this.view.addEventListener("command", this);
    viewCache.content.appendChild(this.view);
    this.renderManagers();
    this.refreshLocalization().catch(error => {
      console.error("DownloadIt: panel localization failed", error);
    });
  }

  destroy() {
    this.destroyed = true;
    this.view?.removeEventListener("command", this);
    this.view?.remove();
    this.removeStylesheet();
    this.managerButtons = [];
    this.view = null;
    this.managerList = null;
    this.status = null;
    this.statusIcon = null;
    this.statusText = null;
    this.linksButton = null;
    this.refreshButton = null;
    this.settingsButton = null;
  }

  handleEvent(event) {
    if (event.type !== "command") {
      return;
    }
    const target = event.target;
    if (target === this.linksButton) {
      this.openLinksDialog();
    } else if (target === this.refreshButton) {
      this.refreshManagers();
    } else if (target === this.settingsButton) {
      this.service.openSettings(this.window);
    } else if (target?.downloadItManagerKey) {
      this.selectManager(target.downloadItManagerKey);
    }
  }

  onViewShowing(event) {
    this.renderManagers();
    if (this.refreshPromise) {
      this.setStatus("downloadit-detection-loading", null, "loading");
    } else if (this.defaultManagerLocked) {
      this.setStatus("downloadit-locked", null, "locked");
    } else {
      this.clearStatus();
    }
    const translation = this.refreshLocalization();
    event?.detail?.addBlocker?.(translation);
  }

  onViewHiding() {}

  openLinksDialog() {
    const browser = this.window.gBrowser?.selectedBrowser;
    if (!browser || this.service.managers.length === 0) {
      return null;
    }
    return openPageLinksDialog(this.window, {
      browser,
      referer: browser.currentURI?.spec || "",
      downloadPageReferer: "",
    });
  }

  renderManagers() {
    if (!this.managerList) {
      return;
    }
    const snapshot = this.service.readSettings();
    const managers = snapshot.managers || [];
    this.defaultManagerLocked = Boolean(snapshot.defaultManagerLocked);
    this.managerButtons = [];
    this.managerList.replaceChildren();

    for (const downloader of managers) {
      const item = createXULElement(this.document, "toolbarbutton", {
        class: "subviewbutton",
        type: "radio",
        group: "downloadit-panel-managers",
        role: "radio",
        label: downloader.name,
      });
      item.downloadItManagerKey = downloader.key;
      if (downloader.custom) {
        this.setLocalized(item, "downloadit-custom-downloader-menu-label", {
          name: downloader.name,
        });
      }
      this.managerButtons.push(item);
      this.managerList.appendChild(item);
    }

    if (this.managerButtons.length === 0) {
      const empty = createXULElement(this.document, "toolbarbutton", {
        class: "subviewbutton",
        disabled: true,
      });
      this.setLocalized(empty, "downloadit-no-manager");
      this.managerList.appendChild(empty);
    }

    this.syncSelection(snapshot.defaultManager || "");
    this.updateDisabledState();
  }

  syncSelection(defaultManager = this.service.defaultManager) {
    for (const item of this.managerButtons) {
      const checked = item.downloadItManagerKey === defaultManager;
      item.checked = checked;
      item.setAttribute("aria-checked", String(checked));
      if (checked) {
        item.setAttribute("checked", "true");
      } else {
        item.removeAttribute("checked");
      }
    }
  }

  selectManager(manager) {
    if (this.refreshPromise || this.defaultManagerLocked) {
      return false;
    }
    try {
      this.service.defaultManager = manager;
      this.syncSelection(manager);
      this.clearStatus();
      return true;
    } catch (error) {
      this.setStatus(
        "downloadit-panel-selection-error",
        { error: error?.message || String(error) },
        "error",
      );
      return false;
    }
  }

  refreshManagers() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.setStatus("downloadit-detection-loading", null, "loading");
    this.updateDisabledState(true);

    this.refreshPromise = (async () => {
      try {
        const managers = await this.service.refreshManagers();
        if (this.destroyed) {
          return managers;
        }
        this.renderManagers();
        this.setStatus(
          "downloadit-detection-success",
          { count: managers.length },
          "success",
        );
        return managers;
      } catch (error) {
        if (!this.destroyed) {
          this.setStatus(
            "downloadit-detection-error",
            { error: error?.message || String(error) },
            "error",
          );
        }
        return null;
      } finally {
        this.refreshPromise = null;
        if (!this.destroyed) {
          this.updateDisabledState();
        }
      }
    })();
    return this.refreshPromise;
  }

  updateDisabledState(refreshing = Boolean(this.refreshPromise)) {
    for (const item of this.managerButtons) {
      item.disabled = refreshing || this.defaultManagerLocked;
      if (item.disabled) {
        item.setAttribute("disabled", "true");
      } else {
        item.removeAttribute("disabled");
      }
    }
    if (this.refreshButton) {
      this.refreshButton.disabled = refreshing;
      if (refreshing) {
        this.refreshButton.setAttribute("disabled", "true");
      } else {
        this.refreshButton.removeAttribute("disabled");
      }
    }
    if (this.linksButton) {
      const disabled = Boolean(
        refreshing ||
        !this.window.gBrowser?.selectedBrowser ||
        this.service.managers.length === 0
      );
      this.linksButton.disabled = disabled;
      if (disabled) {
        this.linksButton.setAttribute("disabled", "true");
      } else {
        this.linksButton.removeAttribute("disabled");
      }
    }
    if (this.view) {
      this.view.setAttribute("aria-busy", String(refreshing));
    }
  }

  clearStatus() {
    if (!this.status) {
      return;
    }
    this.status.hidden = true;
    this.status.setAttribute("hidden", "true");
    this.status.removeAttribute("data-status-kind");
    this.statusIcon?.removeAttribute("src");
    this.statusText?.removeAttribute("data-l10n-id");
    this.statusText?.removeAttribute("data-l10n-args");
  }

  setStatus(id, args = null, kind = "loading") {
    if (!this.status || !this.statusIcon || !this.statusText) {
      return;
    }
    const icon = STATUS_ICONS[kind] || STATUS_ICONS.loading;
    this.status.hidden = false;
    this.status.removeAttribute("hidden");
    this.status.setAttribute("data-status-kind", kind);
    this.statusIcon.setAttribute("src", icon);
    this.setLocalized(this.statusText, id, args);
    Promise.resolve(this.document.l10n?.translateFragment?.(this.status)).catch(error => {
      console.error("DownloadIt: panel status translation failed", error);
    });
  }

  installStylesheet() {
    if (this.stylesheetLoaded) {
      return;
    }
    const { windowUtils } = this.window;
    windowUtils.loadSheetUsingURIString(STYLESHEET_URL, windowUtils.AUTHOR_SHEET);
    this.stylesheetLoaded = true;
  }

  removeStylesheet() {
    if (!this.stylesheetLoaded) {
      return;
    }
    const { windowUtils } = this.window;
    try {
      windowUtils.removeSheetUsingURIString(STYLESHEET_URL, windowUtils.AUTHOR_SHEET);
    } catch (error) {
      console.error("DownloadIt: panel stylesheet cleanup failed", error);
    }
    this.stylesheetLoaded = false;
  }

  setLocalized(element, id, args = null) {
    if (this.document.l10n) {
      this.document.l10n.setAttributes(element, id, args);
    }
  }

  async refreshLocalization() {
    await this.localizationReady;
    if (this.view && this.document.l10n?.translateFragment) {
      await this.document.l10n.translateFragment(this.view);
    }
  }
}
