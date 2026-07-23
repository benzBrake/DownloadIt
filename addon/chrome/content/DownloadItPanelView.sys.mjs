import { createXULElement } from "./DownloadItXUL.sys.mjs";

export const DOWNLOADIT_TOOLBAR_WIDGET_ID = "downloadit-toolbar-button";
export const DOWNLOADIT_PANEL_VIEW_ID = "downloadit-panel-view";

const MANAGER_LIST_ID = "downloadit-panel-manager-list";
const STATUS_ID = "downloadit-panel-status";
const REFRESH_ID = "downloadit-panel-refresh";
const SETTINGS_ID = "downloadit-panel-settings";

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
    this.status = createXULElement(this.document, "description", {
      id: STATUS_ID,
      hidden: true,
      role: "status",
      "aria-live": "polite",
    });
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
    this.managerButtons = [];
    this.view = null;
    this.managerList = null;
    this.status = null;
    this.refreshButton = null;
    this.settingsButton = null;
  }

  handleEvent(event) {
    if (event.type !== "command") {
      return;
    }
    const target = event.target;
    if (target === this.refreshButton) {
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
      this.setStatus("downloadit-detection-loading");
    } else if (this.defaultManagerLocked) {
      this.setStatus("downloadit-locked");
    } else {
      this.clearStatus();
    }
    const translation = this.refreshLocalization();
    event?.detail?.addBlocker?.(translation);
  }

  onViewHiding() {}

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
      this.setStatus("downloadit-panel-selection-error", {
        error: error?.message || String(error),
      });
      return false;
    }
  }

  refreshManagers() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.setStatus("downloadit-detection-loading");
    this.updateDisabledState(true);

    this.refreshPromise = (async () => {
      try {
        const managers = await this.service.refreshManagers();
        if (this.destroyed) {
          return managers;
        }
        this.renderManagers();
        this.setStatus("downloadit-detection-success", {
          count: managers.length,
        });
        return managers;
      } catch (error) {
        if (!this.destroyed) {
          this.setStatus("downloadit-detection-error", {
            error: error?.message || String(error),
          });
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
    this.status.removeAttribute("data-l10n-id");
    this.status.removeAttribute("data-l10n-args");
  }

  setStatus(id, args = null) {
    if (!this.status) {
      return;
    }
    this.status.hidden = false;
    this.status.removeAttribute("hidden");
    this.setLocalized(this.status, id, args);
    Promise.resolve(this.document.l10n?.translateFragment?.(this.status)).catch(error => {
      console.error("DownloadIt: panel status translation failed", error);
    });
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
