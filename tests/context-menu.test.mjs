import test from "node:test";
import assert from "node:assert/strict";

import {
  DownloadItContextMenuController,
  findContextMenuInsertionPoint,
  refreshContextMenuLabel,
} from "../addon/chrome/content/DownloadItContextMenu.sys.mjs";

function mockContextMenu(anchors = {}) {
  const contextMenu = {
    querySelector(selector) {
      return anchors[selector] || null;
    },
  };
  for (const anchor of Object.values(anchors)) {
    if (anchor && !Object.hasOwn(anchor, "parentNode")) {
      anchor.parentNode = contextMenu;
    }
  }
  return contextMenu;
}

function createMockMenuDocument() {
  const document = {
    l10n: {
      setAttributes(element, id, args = null) {
        element.l10nId = id;
        element.l10nArgs = args;
      },
      async translateFragment() {},
      async formatValue(id, args = null) {
        return args?.error ? `${id}: ${args.error}` : id;
      },
    },
    createXULElement(localName) {
      const listeners = new Map();
      return {
        localName,
        children: [],
        attributes: new Map(),
        listeners,
        disabled: false,
        checked: false,
        setAttribute(name, value) {
          const text = String(value);
          this.attributes.set(name, text);
          if (name === "disabled") {
            this.disabled = text === "true";
          } else if (name === "checked") {
            this.checked = text === "true";
          }
        },
        removeAttribute(name) {
          this.attributes.delete(name);
          if (name === "disabled") {
            this.disabled = false;
          } else if (name === "checked") {
            this.checked = false;
          }
        },
        getAttribute(name) {
          return this.attributes.get(name) ?? null;
        },
        append(...children) {
          for (const child of children) {
            this.appendChild(child);
          }
        },
        appendChild(child) {
          child.parentNode = this;
          this.children.push(child);
          return child;
        },
        replaceChildren(...children) {
          this.children = [];
          this.append(...children);
        },
        addEventListener(type, listener) {
          const values = listeners.get(type) || [];
          values.push(listener);
          listeners.set(type, values);
        },
        async dispatch(type) {
          const event = { type, target: this, currentTarget: this };
          for (const listener of listeners.get(type) || []) {
            const result = typeof listener === "function"
              ? listener(event)
              : listener.handleEvent(event);
            await result;
          }
        },
      };
    },
  };
  return document;
}

function createPopupController({
  managers = [
    { key: "default-manager", name: "Default Manager", custom: false },
    { key: "custom-manager", name: "Custom Manager", custom: true },
  ],
  defaultManager = "default-manager",
  defaultManagerLocked = false,
  context = { url: "https://example.com/file.zip" },
  defaultChangeError = null,
  downloadError = null,
} = {}) {
  const document = createMockMenuDocument();
  const events = [];
  const downloads = [];
  const alerts = [];
  let selectedManager = defaultManager;
  const service = {
    managers,
    get defaultManager() {
      return selectedManager;
    },
    set defaultManager(value) {
      events.push(`default:${value}`);
      if (defaultChangeError) {
        throw defaultChangeError;
      }
      selectedManager = value;
    },
    readSettings() {
      return { defaultManagerLocked };
    },
    async downloadLink(downloadContext, manager) {
      events.push(`download:${manager}`);
      downloads.push({ context: downloadContext, manager });
      if (downloadError) {
        throw downloadError;
      }
    },
    resolveDownloader(manager) {
      return managers.find(value => value.key === manager) || null;
    },
    alert(_window, message) {
      alerts.push(message);
    },
    async refreshManagers() {
      return managers;
    },
    openSettings() {},
  };
  const window = { document };
  const controller = new DownloadItContextMenuController(service, window, null);
  controller.context = context;
  controller.popup = document.createXULElement("menupopup");
  controller.rebuildPopup();
  return { alerts, controller, document, downloads, events, service };
}

test("context menu insertion prefers the current Firefox media group", () => {
  const mediaSeparator = {};
  const learnMore = {};
  const contextMenu = mockContextMenu({
    "#context-media-eme-separator": mediaSeparator,
    "#context-media-eme-learnmore": learnMore,
  });

  assert.equal(
    findContextMenuInsertionPoint(contextMenu),
    mediaSeparator,
  );
});

test("context menu insertion does not fall back to the navigation separator", () => {
  const contextMenu = mockContextMenu();

  assert.equal(findContextMenuInsertionPoint(contextMenu), null);
});

test("context menu insertion ignores anchors outside the context menu", () => {
  const mediaSeparator = { parentNode: {} };
  const contextMenu = mockContextMenu({
    "#context-media-eme-separator": mediaSeparator,
  });

  assert.equal(findContextMenuInsertionPoint(contextMenu), null);
});

test("download item label can be refreshed after the application locale changes", () => {
  let localizedId = null;
  const menu = {
  };
  const document = {
    l10n: {
      setAttributes(element, id) {
        assert.equal(element, menu);
        localizedId = id;
      },
    },
  };

  refreshContextMenuLabel(document, menu);

  assert.equal(localizedId, "downloadit-download");
});

test("context menu label refresh explicitly translates the dynamic menu", async () => {
  let translated = null;
  const menu = {};
  const document = {
    l10n: {
      setAttributes() {},
      async translateFragment(element) {
        translated = element;
      },
    },
  };

  await refreshContextMenuLabel(document, menu);

  assert.equal(translated, menu);
});

test("context menu label refresh localizes the options submenu", async () => {
  const localizedIds = new Map();
  const downloadItem = {};
  const optionsMenu = {};
  const document = {
    l10n: {
      setAttributes(element, id) {
        localizedIds.set(element, id);
      },
      async translateFragment() {},
    },
  };

  await refreshContextMenuLabel(document, downloadItem, optionsMenu);

  assert.equal(localizedIds.get(downloadItem), "downloadit-download");
  assert.equal(localizedIds.get(optionsMenu), "downloadit-options");
});

test("context menu label refresh localizes the selection item", async () => {
  const localizedIds = new Map();
  const downloadItem = {};
  const selectionItem = {};
  const document = {
    l10n: {
      setAttributes(element, id) {
        localizedIds.set(element, id);
      },
      async translateFragment() {},
    },
  };

  await refreshContextMenuLabel(document, downloadItem, null, selectionItem);

  assert.equal(localizedIds.get(selectionItem), "downloadit-download-selection");
});

test("context menu label refresh localizes the page-links item", async () => {
  const localizedIds = new Map();
  const downloadItem = {};
  const linksItem = {};
  const document = {
    l10n: {
      setAttributes(element, id) {
        localizedIds.set(element, id);
      },
      async translateFragment() {},
    },
  };

  await refreshContextMenuLabel(document, downloadItem, null, null, linksItem);

  assert.equal(localizedIds.get(linksItem), "downloadit-download-links");
});

test("page-links dialog receives the current browser context without changing defaults", () => {
  const browser = {};
  let call = null;
  const window = {
    document: {},
    openDialog(...args) {
      call = args;
      return { opened: true };
    },
  };
  const service = {
    defaultManager: "default-manager",
    managers: [{ key: "default-manager" }],
  };
  const controller = new DownloadItContextMenuController(service, window, null);
  controller.linksContext = {
    browser,
    referer: "https://example.com/page",
    downloadPageReferer: "https://example.com/",
  };

  assert.deepEqual(controller.openLinksDialog(), { opened: true });
  assert.equal(call[0], "chrome://downloadit/content/links.xhtml");
  assert.match(call[2], /\bmodal\b/);
  assert.equal(call[3].wrappedJSObject.browser, browser);
  assert.equal(service.defaultManager, "default-manager");
});

test("message formatting omits absent Fluent arguments", async () => {
  const window = {
    document: {
      l10n: {
        async formatValue(id, ...args) {
          assert.equal(args.length, 0);
          return id;
        },
      },
    },
  };
  const controller = new DownloadItContextMenuController({}, window, null);

  assert.equal(
    await controller.formatMessage("downloadit-unsupported", null),
    "downloadit-unsupported",
  );
});

test("context menu explicitly synchronizes the selected downloader", () => {
  function item(key) {
    return {
      downloadItManagerKey: key,
      checked: false,
      attributes: new Map(),
      setAttribute(name, value) {
        this.attributes.set(name, String(value));
      },
      removeAttribute(name) {
        this.attributes.delete(name);
      },
      getAttribute(name) {
        return this.attributes.get(name) || null;
      },
    };
  }

  const flashGot = item('{"provider":"flashgot","id":"aria2"}');
  const custom = item('{"provider":"custom","id":"123"}');
  const controller = new DownloadItContextMenuController(
    { defaultManager: custom.downloadItManagerKey },
    { document: {} },
    null,
  );
  controller.defaultManagerItems = [flashGot, custom];

  controller.syncPopupSelection();
  assert.equal(flashGot.checked, false);
  assert.equal(flashGot.getAttribute("checked"), null);
  assert.equal(custom.checked, true);
  assert.equal(custom.getAttribute("checked"), "true");

  controller.syncPopupSelection(flashGot.downloadItManagerKey);
  assert.equal(flashGot.checked, true);
  assert.equal(custom.checked, false);
});

test("context menu separates one-time downloads from default changes", async () => {
  const { controller, downloads, events, service } = createPopupController();
  const [defaultItem, customItem, firstSeparator, defaultMenu] =
    controller.popup.children;

  assert.equal(defaultItem.localName, "menuitem");
  assert.equal(defaultItem.getAttribute("type"), null);
  assert.equal(defaultItem.disabled, false);
  assert.equal(customItem.l10nId, "downloadit-custom-downloader-menu-label");
  assert.deepEqual(customItem.l10nArgs, { name: "Custom Manager" });
  assert.equal(firstSeparator.localName, "menuseparator");
  assert.equal(defaultMenu, controller.defaultManagerMenu);
  assert.equal(defaultMenu.localName, "menu");
  assert.equal(defaultMenu.l10nId, "downloadit-set-default-and-download");
  assert.equal(controller.defaultManagerPopup.localName, "menupopup");
  assert.equal(controller.defaultManagerItems.length, 2);
  assert.equal(controller.defaultManagerItems[0].getAttribute("type"), "radio");
  assert.equal(controller.defaultManagerItems[0].checked, true);
  assert.equal(controller.defaultManagerItems[1].checked, false);
  assert.equal(
    controller.defaultManagerItems[1].l10nId,
    "downloadit-custom-downloader-menu-label",
  );

  await customItem.dispatch("command");

  assert.equal(service.defaultManager, "default-manager");
  assert.deepEqual(events, ["download:custom-manager"]);
  assert.equal(downloads[0].manager, "custom-manager");
});

test("context menu disables managers that cannot handle magnet and ed2k links", () => {
  const { controller } = createPopupController({
    context: { url: "magnet:?xt=urn:btih:example" },
    managers: [
      {
        key: "idm",
        name: "Internet Download Manager",
        custom: false,
        capabilities: { magnet: false, ed2k: false },
      },
      {
        key: "aria2",
        name: "Aria2",
        custom: false,
        capabilities: { magnet: true, ed2k: true },
      },
    ],
    defaultManager: "idm",
  });

  assert.equal(controller.popup.children[0].disabled, true);
  assert.equal(controller.popup.children[1].disabled, false);
  assert.equal(controller.defaultManagerItems[0].disabled, true);
  assert.equal(controller.defaultManagerItems[1].disabled, false);
});

test("default-and-download changes the preference before downloading", async () => {
  const { controller, events, service } = createPopupController();

  await controller.defaultManagerItems[1].dispatch("command");

  assert.equal(service.defaultManager, "custom-manager");
  assert.deepEqual(events, [
    "default:custom-manager",
    "download:custom-manager",
  ]);
  assert.equal(controller.defaultManagerItems[0].checked, false);
  assert.equal(controller.defaultManagerItems[1].checked, true);
});

test("failed default changes restore selection and do not download", async () => {
  const { alerts, controller, downloads, service } = createPopupController({
    defaultChangeError: new Error("preference is locked"),
  });
  controller.defaultManagerItems[0].removeAttribute("checked");
  controller.defaultManagerItems[1].setAttribute("checked", "true");

  await controller.defaultManagerItems[1].dispatch("command");

  assert.equal(service.defaultManager, "default-manager");
  assert.equal(controller.defaultManagerItems[0].checked, true);
  assert.equal(controller.defaultManagerItems[1].checked, false);
  assert.equal(downloads.length, 0);
  assert.deepEqual(alerts, [
    "downloadit-context-default-change-failed: preference is locked",
  ]);
});

test("download failure preserves a successful default change", async () => {
  const { alerts, controller, service } = createPopupController({
    downloadError: new Error("launch failed"),
  });

  await controller.defaultManagerItems[1].dispatch("command");

  assert.equal(service.defaultManager, "custom-manager");
  assert.equal(controller.defaultManagerItems[1].checked, true);
  assert.deepEqual(alerts, [
    "downloadit-download-failed: launch failed",
  ]);
});

test("locked preferences and missing links disable only download actions", () => {
  const locked = createPopupController({ defaultManagerLocked: true });
  assert.equal(locked.controller.popup.children[0].disabled, false);
  assert.equal(locked.controller.defaultManagerMenu.disabled, true);

  const noContext = createPopupController({ context: null });
  assert.equal(noContext.controller.popup.children[0].disabled, true);
  assert.equal(noContext.controller.popup.children[1].disabled, true);
  assert.equal(noContext.controller.defaultManagerMenu.disabled, true);
  assert.equal(
    noContext.controller.popup.children.at(-3).l10nId,
    "downloadit-refresh",
  );
  assert.equal(
    noContext.controller.popup.children.at(-1).l10nId,
    "downloadit-settings",
  );
});

test("empty manager lists omit the default-change submenu", () => {
  const { controller } = createPopupController({
    managers: [],
    defaultManager: "",
  });

  assert.equal(controller.defaultManagerMenu, null);
  assert.equal(controller.defaultManagerPopup, null);
  assert.deepEqual(controller.defaultManagerItems, []);
  assert.equal(controller.popup.children[0].l10nId, "downloadit-no-manager");
  assert.equal(controller.popup.children[0].disabled, true);
  assert.equal(controller.popup.children[1].l10nId, "downloadit-refresh");
  assert.equal(controller.popup.children.at(-1).l10nId, "downloadit-settings");
});

test("context menu exposes only supported download targets", () => {
  const contextMenu = {
    onLink: true,
    linkURL: "https://example.com/file.zip",
    linkTextStr: "File",
    linkDownload: "",
    browser: { currentURI: { spec: "https://example.com/page" } },
    contentData: {},
  };
  const controller = new DownloadItContextMenuController(
    { defaultManager: "default-manager", managers: ["default-manager"] },
    {
      document: {},
      gContextMenu: contextMenu,
      gBrowser: { selectedBrowser: contextMenu.browser },
    },
    null,
  );
  controller.downloadItem = {};
  controller.selectionDownloadItem = {};
  controller.linksDownloadItem = {};
  controller.menu = {};
  controller.refreshMenuLabel = () => {};

  controller.updateContext();
  assert.equal(controller.context.url, "https://example.com/file.zip");
  assert.equal(controller.downloadItem.hidden, false);

  for (const [url, filename] of [
    ["blob:https://example.com/id", "file.zip"],
    ["https://example.com/addon%2Expi", ""],
    ["https://example.com/download?id=1", "addon.xpi"],
  ]) {
    contextMenu.linkURL = url;
    contextMenu.linkDownload = filename;
    controller.updateContext();
    assert.equal(controller.context, null, `${url} (${filename})`);
    assert.equal(controller.downloadItem.hidden, true, `${url} (${filename})`);
  }
});

test("selection link queries retain each source frame browsing context", async () => {
  const createBrowsingContext = (id, links, children = []) => ({
    id,
    children,
    currentWindowGlobal: {
      getActor() {
        return { sendQuery: async () => links };
      },
    },
  });
  const child = createBrowsingContext(20, [{
    url: "https://example.com/child.zip",
    description: "Child",
    filename: "",
  }]);
  const root = createBrowsingContext(10, [
    {
      url: "https://example.com/root.zip",
      description: "Root",
      filename: "root.zip",
    },
    {
      url: "https://example.com/download?id=1",
      description: "Firefox add-on",
      filename: "addon.xpi",
    },
    {
      url: "blob:https://example.com/id",
      description: "Browser native",
      filename: "file.zip",
    },
  ], [child]);
  const controller = new DownloadItContextMenuController(
    {},
    { document: {} },
    null,
  );

  assert.deepEqual(
    await controller.querySelectionLinks({ browsingContext: root }),
    [
      {
        url: "https://example.com/root.zip",
        description: "Root",
        filename: "root.zip",
        browsingContextId: 10,
      },
      {
        url: "https://example.com/child.zip",
        description: "Child",
        filename: "",
        browsingContextId: 20,
      },
    ],
  );
});
