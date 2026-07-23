import { isSupportedURL } from "./DownloadItProtocol.sys.mjs";
import { createXULElement } from "./DownloadItXUL.sys.mjs";

function normalizeDownloader(value) {
  return typeof value === "string"
    ? { key: value, name: value, custom: false }
    : value;
}

const DOWNLOAD_ERROR_MESSAGES = {
  "command-launch-failed": "downloadit-error-command-launch",
  "command-partial-failure": "downloadit-error-command-partial",
  "aria2-unavailable": "downloadit-error-aria2-unavailable",
  "aria2-http-error": "downloadit-error-aria2-http",
  "aria2-response-invalid": "downloadit-error-aria2-response",
  "aria2-rpc-error": "downloadit-error-aria2-rpc",
  "aria2-partial-failure": "downloadit-error-aria2-partial",
  "aria2-autostart-local-only": "downloadit-error-aria2-local",
  "aria2-start-timeout": "downloadit-error-aria2-start-timeout",
};

const CONTEXT_MENU_ID = "contentAreaContextMenu";
const DOWNLOADIT_MENU_ID = "downloadit-context-menu";
const DOWNLOADIT_POPUP_ID = "downloadit-context-popup";
const DOWNLOADIT_DOWNLOAD_ID = "downloadit-download-default";
const DOWNLOADIT_SELECTION_ID = "downloadit-download-selection";
const SELECTION_QUERY = "DownloadIt:GetSelectionLinks";

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

export async function refreshContextMenuLabel(
  document,
  downloadItem,
  optionsMenu = null,
  selectionItem = null,
) {
  if (!document?.l10n || !downloadItem) {
    return;
  }
  document.l10n.setAttributes(downloadItem, "downloadit-download");
  if (selectionItem) {
    document.l10n.setAttributes(selectionItem, "downloadit-download-selection");
  }
  if (optionsMenu) {
    document.l10n.setAttributes(optionsMenu, "downloadit-options");
  }
  if (typeof document.l10n.translateFragment === "function") {
    await document.l10n.translateFragment(downloadItem);
    if (selectionItem) {
      await document.l10n.translateFragment(selectionItem);
    }
    if (optionsMenu) {
      await document.l10n.translateFragment(optionsMenu);
    }
  }
}

export class DownloadItContextMenuController {
  constructor(service, window, initializeLocalization) {
    this.service = service;
    this.window = window;
    this.initializeLocalization = initializeLocalization;
    this.document = window.document;
    this.localizationReady = Promise.resolve();
    this.context = null;
    this.selectionContext = null;
    this.selectionGeneration = 0;
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
    this.document.getElementById(DOWNLOADIT_DOWNLOAD_ID)?.remove();
    this.document.getElementById(DOWNLOADIT_SELECTION_ID)?.remove();
    this.downloadItem = createXULElement(this.document, "menuitem", {
      id: DOWNLOADIT_DOWNLOAD_ID,
      class: "menuitem-iconic",
      hidden: "true",
      style: "--menuitem-icon: url(chrome://browser/skin/downloads/downloads.svg); list-style-image: url(chrome://browser/skin/downloads/downloads.svg);",
    });
    this.downloadItem.addEventListener("command", () => {
      this.download(this.service.defaultManager);
    });
    this.selectionDownloadItem = createXULElement(this.document, "menuitem", {
      id: DOWNLOADIT_SELECTION_ID,
      class: "menuitem-iconic",
      hidden: "true",
      disabled: "true",
      style: "--menuitem-icon: url(chrome://browser/skin/downloads/downloads.svg); list-style-image: url(chrome://browser/skin/downloads/downloads.svg);",
    });
    this.selectionDownloadItem.addEventListener("command", () => {
      this.downloadSelection(this.service.defaultManager);
    });
    this.menu = createXULElement(this.document, "menu", {
      id: DOWNLOADIT_MENU_ID,
      class: "menu-iconic",
      style: "--menuitem-icon: url(chrome://browser/skin/downloads/downloads.svg); list-style-image: url(chrome://browser/skin/downloads/downloads.svg);",
    });
    this.popup = createXULElement(this.document, "menupopup", {
      id: DOWNLOADIT_POPUP_ID,
    });
    this.menu.appendChild(this.popup);

    const insertionPoint = findContextMenuInsertionPoint(this.contextMenu);
    if (insertionPoint) {
      this.contextMenu.insertBefore(this.downloadItem, insertionPoint);
      this.contextMenu.insertBefore(this.selectionDownloadItem, insertionPoint);
      this.contextMenu.insertBefore(this.menu, insertionPoint);
    } else {
      // Keep the failure mode deterministic when Firefox changes its menu
      // markup again: append to this menu, never fall back to another group.
      this.contextMenu.appendChild(this.downloadItem);
      this.contextMenu.appendChild(this.selectionDownloadItem);
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
    this.downloadItem?.remove();
    this.selectionDownloadItem?.remove();
    this.menu?.remove();
    this.context = null;
    this.selectionContext = null;
    this.selectionGeneration += 1;
    this.downloadItem = null;
    this.selectionDownloadItem = null;
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
    return refreshContextMenuLabel(
      this.document,
      this.downloadItem,
      this.menu,
      this.selectionDownloadItem,
    ).catch(error => {
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
    const message = args == null
      ? await this.document.l10n.formatValue(id)
      : await this.document.l10n.formatValue(id, args);
    return message || id;
  }

  async formatDownloadError(error) {
    const id = DOWNLOAD_ERROR_MESSAGES[error?.code];
    return id
      ? this.formatMessage(id, error.args || null)
      : error?.message || String(error);
  }

  updateContext() {
    this.refreshMenuLabel();
    const contextMenu = this.window.gContextMenu;
    const selectionGeneration = ++this.selectionGeneration;
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
    this.selectionContext = null;
    this.downloadItem.hidden = !this.context;
    this.downloadItem.disabled = !this.context || !this.service.defaultManager;
    const hasTextSelection = contextMenu?.isTextSelected === true;
    this.selectionDownloadItem.hidden = !hasTextSelection;
    this.selectionDownloadItem.disabled = true;
    if (hasTextSelection && browser) {
      this.loadSelectionContext(browser, referer, downloadPageReferer, selectionGeneration);
    }
    this.menu.hidden = false;
  }

  async loadSelectionContext(browser, referer, downloadPageReferer, generation) {
    try {
      const links = await this.querySelectionLinks(browser);
      if (generation !== this.selectionGeneration) {
        return;
      }
      this.selectionContext = links.length > 0 ? {
        links: links.map(link => ({
          ...link,
          browser,
          referer,
          downloadPageReferer,
        })),
      } : null;
      this.selectionDownloadItem.disabled = !this.selectionContext || !this.service.defaultManager;
    } catch (error) {
      if (generation === this.selectionGeneration) {
        this.selectionContext = null;
        this.selectionDownloadItem.disabled = true;
      }
      console.error("DownloadIt: selection link query failed", error);
    }
  }

  async querySelectionLinks(browser) {
    const browsingContexts = [];
    const visit = browsingContext => {
      if (!browsingContext || browsingContexts.includes(browsingContext)) {
        return;
      }
      browsingContexts.push(browsingContext);
      for (const child of browsingContext.children || []) {
        visit(child);
      }
    };
    visit(browser?.browsingContext);

    const responses = await Promise.all(browsingContexts.map(async browsingContext => {
      try {
        const windowGlobal = browsingContext.currentWindowGlobal;
        const actor = windowGlobal?.getActor?.("DownloadItSelection");
        return actor ? await actor.sendQuery(SELECTION_QUERY) : [];
      } catch {
        return [];
      }
    }));

    const links = [];
    const seen = new Set();
    for (const response of responses) {
      for (const link of Array.isArray(response) ? response : []) {
        if (!isSupportedURL(link?.url) || seen.has(link.url)) {
          continue;
        }
        seen.add(link.url);
        links.push(link);
      }
    }
    return links;
  }

  rebuildPopup() {
    this.popup.replaceChildren();

    const defaultManager = this.service.defaultManager;
    for (const value of this.service.managers) {
      const downloader = normalizeDownloader(value);
      const item = createXULElement(this.document, "menuitem", {
        label: downloader.name,
        type: "radio",
        name: "downloadit-download-manager",
        value: downloader.key,
        checked: downloader.key === defaultManager ? "true" : null,
      });
      item.downloadItManagerKey = downloader.key;
      item.checked = downloader.key === defaultManager;
      if (downloader.custom) {
        this.setLocalized(item, "downloadit-custom-downloader-menu-label", {
          name: downloader.name,
        });
      }
      item.addEventListener("command", () => {
        this.service.defaultManager = downloader.key;
        this.syncPopupSelection(downloader.key);
        this.download(downloader.key);
      });
      this.popup.appendChild(item);
    }

    if (this.service.managers.length === 0) {
      const noManagerItem = createXULElement(this.document, "menuitem", {
        disabled: "true",
      });
      this.popup.appendChild(noManagerItem);
      this.setLocalized(noManagerItem, "downloadit-no-manager");
    }

    if (this.service.managers.length > 0) {
      this.popup.appendChild(createXULElement(this.document, "menuseparator"));
    }
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
    Promise.resolve(this.document.l10n?.translateFragment?.(this.popup)).then(() => {
      this.syncPopupSelection();
    }).catch(error => {
      console.error("DownloadIt: manager menu translation failed", error);
    });
  }

  syncPopupSelection(defaultManager = this.service.defaultManager) {
    for (const item of this.popup?.children || []) {
      if (!item.downloadItManagerKey) {
        continue;
      }
      const checked = item.downloadItManagerKey === defaultManager;
      item.checked = checked;
      if (checked) {
        item.setAttribute("checked", "true");
      } else {
        item.removeAttribute("checked");
      }
    }
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
        ? {
            manager: this.service.resolveDownloader?.(manager)?.name || manager,
            error: await this.formatDownloadError(error),
          }
        : null;
      this.service.alert(
        this.window,
        await this.formatMessage(messageId, args),
      );
    }
  }

  async downloadSelection(manager) {
    if (!this.selectionContext || !manager) {
      return;
    }
    try {
      await this.service.downloadLinks(this.selectionContext.links, manager);
    } catch (error) {
      const messageId = error?.code === "unsupported-url"
        ? "downloadit-unsupported"
        : "downloadit-download-selection-failed";
      const args = messageId === "downloadit-download-selection-failed"
        ? {
            manager: this.service.resolveDownloader?.(manager)?.name || manager,
            error: await this.formatDownloadError(error),
          }
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
