import { isSupportedURL } from "./DownloadItProtocol.sys.mjs";

const CONTEXT_MENU_ID = "contentAreaContextMenu";
const DOWNLOADIT_MENU_ID = "downloadit-context-menu";
const DOWNLOADIT_POPUP_ID = "downloadit-context-popup";

// Firefox keeps this group at the end of the content context menu. The old
// learn-more/sibling-separator selector no longer matches current Firefox,
// which made the fallback place DownloadIt near the navigation items.
const INSERTION_ANCHOR_SELECTORS = [
  "#context-media-eme-separator",
  "#context-media-eme-learnmore",
];

export function findContextMenuInsertionPoint(contextMenu) {
  for (const selector of INSERTION_ANCHOR_SELECTORS) {
    const candidate = contextMenu?.querySelector?.(selector);
    if (candidate?.parentNode === contextMenu) {
      return candidate;
    }
  }
  return null;
}

export async function refreshContextMenuLabel(document, menu) {
  if (!document?.l10n || !menu) {
    return;
  }
  document.l10n.setAttributes(menu, "downloadit-root");
  if (typeof document.l10n.translateFragment === "function") {
    await document.l10n.translateFragment(menu);
  }
}

function createXULElement(document, tagName, attributes = {}) {
  const element = document.createXULElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      element.setAttribute(name, String(value));
    }
  }
  return element;
}

export class DownloadItContextMenuController {
  constructor(service, window, initializeLocalization) {
    this.service = service;
    this.window = window;
    this.initializeLocalization = initializeLocalization;
    this.document = window.document;
    this.localizationReady = Promise.resolve();
    this.context = null;
    this.menu = null;
    this.popup = null;
    this.contextMenu = null;
  }

  init() {
    this.localizationReady = Promise.resolve(
      this.initializeLocalization?.(this.window),
    );
    this.contextMenu = this.document.getElementById(CONTEXT_MENU_ID);
    if (!this.contextMenu) {
      throw new Error("Firefox content context menu was not found");
    }

    this.document.getElementById(DOWNLOADIT_MENU_ID)?.remove();
    this.menu = createXULElement(this.document, "menu", {
      id: DOWNLOADIT_MENU_ID,
      class: "menu-iconic",
      hidden: "true",
      style: "--menuitem-icon: url(chrome://browser/skin/downloads/downloads.svg); list-style-image: url(chrome://browser/skin/downloads/downloads.svg);",
    });
    this.popup = createXULElement(this.document, "menupopup", {
      id: DOWNLOADIT_POPUP_ID,
    });
    this.menu.appendChild(this.popup);

    const insertionPoint = findContextMenuInsertionPoint(this.contextMenu);
    if (insertionPoint) {
      this.contextMenu.insertBefore(this.menu, insertionPoint);
    } else {
      // Keep the failure mode deterministic when Firefox changes its menu
      // markup again: append to this menu, never fall back to another group.
      this.contextMenu.appendChild(this.menu);
    }

    this.contextMenu.addEventListener("popupshowing", this);
    this.popup.addEventListener("popupshowing", this);
    this.refreshMenuLabel();
    this.localizationReady.then(() => this.refreshMenuLabel()).catch(error => {
      console.error("DownloadIt: context-menu localization failed", error);
    });
  }

  destroy() {
    this.contextMenu?.removeEventListener("popupshowing", this);
    this.popup?.removeEventListener("popupshowing", this);
    this.menu?.remove();
    this.context = null;
    this.menu = null;
    this.popup = null;
    this.contextMenu = null;
  }

  handleEvent(event) {
    if (event.type !== "popupshowing") {
      return;
    }
    if (event.currentTarget === this.contextMenu && event.target === this.contextMenu) {
      this.updateContext();
    } else if (event.currentTarget === this.popup && event.target === this.popup) {
      this.rebuildPopup();
    }
  }

  refreshMenuLabel() {
    return refreshContextMenuLabel(this.document, this.menu).catch(error => {
      console.error("DownloadIt: context-menu label refresh failed", error);
    });
  }

  setLocalized(element, id, args = null) {
    if (this.document.l10n) {
      this.document.l10n.setAttributes(element, id, args);
    }
  }

  async formatMessage(id, args = null) {
    await this.localizationReady;
    if (!this.document.l10n) {
      return id;
    }
    return await this.document.l10n.formatValue(id, args) || id;
  }

  updateContext() {
    this.refreshMenuLabel();
    const contextMenu = this.window.gContextMenu;
    const url = contextMenu?.onLink ? contextMenu.linkURL : "";
    const browser = contextMenu?.browser || this.window.gBrowser?.selectedBrowser;
    const referer = browser?.currentURI?.spec || "";
    const downloadPageReferer = contextMenu?.contentData?.referrerInfo
      ?.originalReferrer?.spec || "";

    this.context = isSupportedURL(url) ? {
      url,
      description: contextMenu.linkTextStr || url,
      filename: contextMenu.linkDownload || "",
      browser,
      referer,
      downloadPageReferer,
    } : null;
    this.menu.hidden = !this.context;
  }

  rebuildPopup() {
    this.popup.replaceChildren();

    const defaultManager = this.service.defaultManager;
    const defaultItem = createXULElement(this.document, "menuitem", {
      id: "downloadit-download-default",
      disabled: !defaultManager || !this.context ? "true" : null,
      class: "menuitem-iconic",
      style: "--menuitem-icon: url(chrome://browser/skin/downloads/downloads.svg); list-style-image: url(chrome://browser/skin/downloads/downloads.svg);",
    });
    defaultItem.addEventListener("command", () => this.download(defaultManager));
    this.popup.appendChild(defaultItem);
    this.setLocalized(
      defaultItem,
      defaultManager ? "downloadit-default-download" : "downloadit-no-manager",
      defaultManager ? { manager: defaultManager } : null,
    );
    this.popup.appendChild(createXULElement(this.document, "menuseparator"));

    for (const manager of this.service.managers) {
      const item = createXULElement(this.document, "menuitem", {
        label: manager,
        type: "radio",
        name: "downloadit-download-manager",
        checked: manager === defaultManager ? "true" : null,
      });
      item.addEventListener("command", () => {
        this.service.defaultManager = manager;
        this.download(manager);
      });
      this.popup.appendChild(item);
    }

    this.popup.appendChild(createXULElement(this.document, "menuseparator"));
    const refreshItem = createXULElement(this.document, "menuitem", {
    });
    refreshItem.addEventListener("command", () => this.refreshManagers());
    this.popup.appendChild(refreshItem);
    this.setLocalized(refreshItem, "downloadit-refresh");

    this.popup.appendChild(createXULElement(this.document, "menuseparator"));
    const settingsItem = createXULElement(this.document, "menuitem", {
      class: "menuitem-iconic",
      style: "--menuitem-icon: url(chrome://global/skin/icons/settings.svg); list-style-image: url(chrome://global/skin/icons/settings.svg);",
    });
    settingsItem.addEventListener("command", () => this.service.openSettings(this.window));
    this.popup.appendChild(settingsItem);
    this.setLocalized(settingsItem, "downloadit-settings");
  }

  async download(manager) {
    if (!this.context || !manager) {
      return;
    }
    try {
      await this.service.downloadLink(this.context, manager);
    } catch (error) {
      const messageId = error?.code === "unsupported-url"
        ? "downloadit-unsupported"
        : "downloadit-download-failed";
      const args = messageId === "downloadit-download-failed"
        ? { manager, error: error.message || String(error) }
        : null;
      this.service.alert(
        this.window,
        await this.formatMessage(messageId, args),
      );
    }
  }

  async refreshManagers() {
    try {
      const managers = await this.service.refreshManagers();
      this.service.alert(
        this.window,
        await this.formatMessage("downloadit-refresh-done", { count: managers.length }),
      );
    } catch (error) {
      this.service.alert(
        this.window,
        await this.formatMessage("downloadit-scan-failed", {
          error: error.message || String(error),
        }),
      );
    }
  }
}
