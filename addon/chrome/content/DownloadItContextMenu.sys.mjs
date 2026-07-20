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
  constructor(service, window) {
    this.service = service;
    this.window = window;
    this.document = window.document;
    this.context = null;
    this.menu = null;
    this.popup = null;
    this.contextMenu = null;
  }

  init() {
    this.contextMenu = this.document.getElementById(CONTEXT_MENU_ID);
    if (!this.contextMenu) {
      throw new Error("Firefox content context menu was not found");
    }

    this.document.getElementById(DOWNLOADIT_MENU_ID)?.remove();
    this.menu = createXULElement(this.document, "menu", {
      id: DOWNLOADIT_MENU_ID,
      label: this.service.message("root"),
      accesskey: "D",
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

  updateContext() {
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
      label: defaultManager
        ? this.service.message("defaultDownload", defaultManager)
        : this.service.message("noManager"),
      disabled: !defaultManager || !this.context ? "true" : null,
      class: "menuitem-iconic",
      style: "--menuitem-icon: url(chrome://browser/skin/downloads/downloads.svg); list-style-image: url(chrome://browser/skin/downloads/downloads.svg);",
    });
    defaultItem.addEventListener("command", () => this.download(defaultManager));
    this.popup.appendChild(defaultItem);
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
      label: this.service.message("refresh"),
    });
    refreshItem.addEventListener("command", () => this.refreshManagers());
    this.popup.appendChild(refreshItem);

    this.popup.appendChild(createXULElement(this.document, "menuseparator"));
    const settingsItem = createXULElement(this.document, "menuitem", {
      label: this.service.message("settings"),
      class: "menuitem-iconic",
      style: "--menuitem-icon: url(chrome://global/skin/icons/settings.svg); list-style-image: url(chrome://global/skin/icons/settings.svg);",
    });
    settingsItem.addEventListener("command", () => this.service.openSettings(this.window));
    this.popup.appendChild(settingsItem);
  }

  async download(manager) {
    if (!this.context || !manager) {
      return;
    }
    try {
      await this.service.downloadLink(this.context, manager);
    } catch (error) {
      this.service.alert(
        this.window,
        this.service.message("downloadFailed", manager, error.message || error)
      );
    }
  }

  async refreshManagers() {
    try {
      const managers = await this.service.refreshManagers();
      this.service.alert(
        this.window,
        this.service.message("refreshDone", managers.length)
      );
    } catch (error) {
      this.service.alert(
        this.window,
        this.service.message("scanFailed", error.message || error)
      );
    }
  }
}
