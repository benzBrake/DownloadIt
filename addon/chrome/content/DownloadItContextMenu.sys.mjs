import {
  classifyDownloadTarget,
  DOWNLOAD_TARGET_CLASSIFICATION,
} from "./DownloadItProtocol.sys.mjs";
import { openPageLinksDialog } from "./DownloadItLinks.sys.mjs";
import { createXULElement } from "./DownloadItXUL.sys.mjs";

function normalizeDownloader(value) {
  return typeof value === "string"
    ? { key: value, name: value, custom: false }
    : value;
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

const CONTEXT_MENU_ID = "contentAreaContextMenu";
const DOWNLOADIT_MENU_ID = "downloadit-context-menu";
const DOWNLOADIT_POPUP_ID = "downloadit-context-popup";
const DOWNLOADIT_DOWNLOAD_ID = "downloadit-download-default";
const DOWNLOADIT_SELECTION_ID = "downloadit-download-selection";
const DOWNLOADIT_LINKS_ID = "downloadit-download-links";
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
  linksItem = null,
) {
  if (!document?.l10n || !downloadItem) {
    return;
  }
  document.l10n.setAttributes(downloadItem, "downloadit-download");
  if (selectionItem) {
    document.l10n.setAttributes(selectionItem, "downloadit-download-selection");
  }
  if (linksItem) {
    document.l10n.setAttributes(linksItem, "downloadit-download-links");
  }
  if (optionsMenu) {
    document.l10n.setAttributes(optionsMenu, "downloadit-options");
  }
  if (typeof document.l10n.translateFragment === "function") {
    await document.l10n.translateFragment(downloadItem);
    if (selectionItem) {
      await document.l10n.translateFragment(selectionItem);
    }
    if (linksItem) {
      await document.l10n.translateFragment(linksItem);
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
    this.linksContext = null;
    this.selectionGeneration = 0;
    this.menu = null;
    this.popup = null;
    this.defaultManagerMenu = null;
    this.defaultManagerPopup = null;
    this.defaultManagerItems = [];
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
    this.document.getElementById(DOWNLOADIT_LINKS_ID)?.remove();
    this.downloadItem = createXULElement(this.document, "menuitem", {
      id: DOWNLOADIT_DOWNLOAD_ID,
      class: "menuitem-iconic",
      hidden: "true",
      style: "--menuitem-icon: url(chrome://downloadit/content/icons/downloadit.svg); list-style-image: url(chrome://downloadit/content/icons/downloadit.svg);",
    });
    this.downloadItem.addEventListener("command", () => {
      this.download(this.service.defaultManager);
    });
    this.selectionDownloadItem = createXULElement(this.document, "menuitem", {
      id: DOWNLOADIT_SELECTION_ID,
      class: "menuitem-iconic",
      hidden: "true",
      disabled: "true",
      style: "--menuitem-icon: url(chrome://downloadit/content/icons/downloadit.svg); list-style-image: url(chrome://downloadit/content/icons/downloadit.svg);",
    });
    this.selectionDownloadItem.addEventListener("command", () => {
      this.downloadSelection(this.service.defaultManager);
    });
    this.linksDownloadItem = createXULElement(this.document, "menuitem", {
      id: DOWNLOADIT_LINKS_ID,
      class: "menuitem-iconic",
      disabled: "true",
      style: "--menuitem-icon: url(chrome://downloadit/content/icons/downloadit.svg); list-style-image: url(chrome://downloadit/content/icons/downloadit.svg);",
    });
    this.linksDownloadItem.addEventListener("command", () => {
      this.openLinksDialog();
    });
    this.menu = createXULElement(this.document, "menu", {
      id: DOWNLOADIT_MENU_ID,
      class: "menu-iconic",
      style: "--menuitem-icon: url(chrome://downloadit/content/icons/downloadit.svg); list-style-image: url(chrome://downloadit/content/icons/downloadit.svg);",
    });
    this.popup = createXULElement(this.document, "menupopup", {
      id: DOWNLOADIT_POPUP_ID,
    });
    this.menu.appendChild(this.popup);

    const insertionPoint = findContextMenuInsertionPoint(this.contextMenu);
    if (insertionPoint) {
      this.contextMenu.insertBefore(this.downloadItem, insertionPoint);
      this.contextMenu.insertBefore(this.selectionDownloadItem, insertionPoint);
      this.contextMenu.insertBefore(this.linksDownloadItem, insertionPoint);
      this.contextMenu.insertBefore(this.menu, insertionPoint);
    } else {
      // Keep the failure mode deterministic when Firefox changes its menu
      // markup again: append to this menu, never fall back to another group.
      this.contextMenu.appendChild(this.downloadItem);
      this.contextMenu.appendChild(this.selectionDownloadItem);
      this.contextMenu.appendChild(this.linksDownloadItem);
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
    this.linksDownloadItem?.remove();
    this.menu?.remove();
    this.context = null;
    this.selectionContext = null;
    this.linksContext = null;
    this.selectionGeneration += 1;
    this.downloadItem = null;
    this.selectionDownloadItem = null;
    this.linksDownloadItem = null;
    this.menu = null;
    this.popup = null;
    this.defaultManagerMenu = null;
    this.defaultManagerPopup = null;
    this.defaultManagerItems = [];
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
      this.linksDownloadItem,
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
    const contentData = contextMenu?.contentData;
    const browsingContext = contentData?.frameBrowsingContext ||
      contentData?.browsingContext || browser?.browsingContext || null;
    const principal = contentData?.principal ||
      browsingContext?.currentWindowGlobal?.documentPrincipal || null;
    const referer = browser?.currentURI?.spec || "";
    const referrerInfo = contentData?.linkReferrerInfo ||
      contentData?.referrerInfo || null;
    const downloadPageReferer = contentData?.referrerInfo
      ?.originalReferrer?.spec || "";

    const filename = contextMenu?.linkDownload || "";
    this.context = classifyDownloadTarget({ url, filename }) ===
      DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED ? {
      url,
      description: contextMenu.linkTextStr || url,
      filename,
      browser,
      referer,
      downloadPageReferer,
      browsingContextId: browsingContext?.id || 0,
      loadingPrincipal: principal,
      referrerInfo,
      cookieJarSettings: contentData?.cookieJarSettings ||
        browsingContext?.currentWindowGlobal?.cookieJarSettings || null,
      userContextId: contentData?.userContextId ??
        principal?.originAttributes?.userContextId ?? 0,
      isPrivate: Boolean(
        browsingContext?.usePrivateBrowsing ||
        principal?.originAttributes?.privateBrowsingId,
      ),
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
    this.linksContext = browser ? {
      browser,
      referer,
      downloadPageReferer,
    } : null;
    this.linksDownloadItem.hidden = false;
    this.linksDownloadItem.disabled = !this.linksContext || this.service.managers.length === 0;
    this.menu.hidden = false;
  }

  openLinksDialog() {
    if (
      !this.linksContext ||
      this.service.managers.length === 0 ||
      typeof this.window.openDialog !== "function"
    ) {
      return null;
    }
    return openPageLinksDialog(this.window, this.linksContext);
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
        const actor = windowGlobal?.getActor?.("DownloadItLinkCollector");
        return {
          browsingContextId: browsingContext.id || 0,
          links: actor ? await actor.sendQuery(SELECTION_QUERY) : [],
        };
      } catch {
        return { browsingContextId: browsingContext.id || 0, links: [] };
      }
    }));

    const links = [];
    const seen = new Set();
    for (const response of responses) {
      for (const link of Array.isArray(response.links) ? response.links : []) {
        if (
          classifyDownloadTarget(link) !==
            DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED ||
          seen.has(link.url)
        ) {
          continue;
        }
        seen.add(link.url);
        const value = { ...link };
        if (
          Number.isInteger(response.browsingContextId) &&
          response.browsingContextId > 0
        ) {
          value.browsingContextId = response.browsingContextId;
        }
        links.push(value);
      }
    }
    return links;
  }

  rebuildPopup() {
    this.popup.replaceChildren();
    this.defaultManagerMenu = null;
    this.defaultManagerPopup = null;
    this.defaultManagerItems = [];

    const defaultManager = this.service.defaultManager;
    const defaultManagerLocked = Boolean(
      this.service.readSettings?.()?.defaultManagerLocked,
    );
    for (const value of this.service.managers) {
      const downloader = normalizeDownloader(value);
      const item = createXULElement(this.document, "menuitem", {
        label: downloader.name,
        value: downloader.key,
        disabled: !this.context,
      });
      item.downloadItManagerKey = downloader.key;
      if (downloader.custom) {
        this.setLocalized(item, "downloadit-custom-downloader-menu-label", {
          name: downloader.name,
        });
      }
      item.addEventListener("command", () => this.download(downloader.key));
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

      this.defaultManagerMenu = createXULElement(this.document, "menu", {
        disabled: !this.context || defaultManagerLocked,
      });
      this.setLocalized(
        this.defaultManagerMenu,
        "downloadit-set-default-and-download",
      );
      this.defaultManagerPopup = createXULElement(this.document, "menupopup");
      this.defaultManagerMenu.appendChild(this.defaultManagerPopup);

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
        item.addEventListener(
          "command",
          () => this.setDefaultAndDownload(downloader.key),
        );
        this.defaultManagerItems.push(item);
        this.defaultManagerPopup.appendChild(item);
      }

      this.popup.appendChild(this.defaultManagerMenu);
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
    for (const item of this.defaultManagerItems) {
      const checked = item.downloadItManagerKey === defaultManager;
      item.checked = checked;
      if (checked) {
        item.setAttribute("checked", "true");
      } else {
        item.removeAttribute("checked");
      }
    }
  }

  async setDefaultAndDownload(manager) {
    if (!this.context || !manager) {
      return;
    }
    try {
      this.service.defaultManager = manager;
    } catch (error) {
      this.syncPopupSelection();
      this.service.alert(
        this.window,
        await this.formatMessage("downloadit-context-default-change-failed", {
          error: error?.message || String(error),
        }),
      );
      return;
    }
    this.syncPopupSelection(manager);
    await this.download(manager);
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
