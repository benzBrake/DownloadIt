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
  controller.popup = { children: [flashGot, custom, {}] };

  controller.syncPopupSelection();
  assert.equal(flashGot.checked, false);
  assert.equal(flashGot.getAttribute("checked"), null);
  assert.equal(custom.checked, true);
  assert.equal(custom.getAttribute("checked"), "true");

  controller.syncPopupSelection(flashGot.downloadItManagerKey);
  assert.equal(flashGot.checked, true);
  assert.equal(custom.checked, false);
});
