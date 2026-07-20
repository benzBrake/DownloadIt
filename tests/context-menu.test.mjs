import test from "node:test";
import assert from "node:assert/strict";

import {
  findContextMenuInsertionPoint,
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
