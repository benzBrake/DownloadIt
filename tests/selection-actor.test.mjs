import test from "node:test";
import assert from "node:assert/strict";

import { collectSelectionLinks } from "../addon/chrome/content/DownloadItSelectionActor.sys.mjs";

test("selection Actor returns links intersecting the current selection", () => {
  const first = {
    href: "https://example.com/one.zip",
    textContent: " One ",
    getAttribute(name) {
      return name === "download" ? "one.zip" : null;
    },
  };
  const second = {
    href: "https://example.com/two.zip",
    textContent: "Two",
    getAttribute() {
      return null;
    },
  };
  const outside = {
    href: "https://example.com/outside.zip",
    textContent: "Outside",
    getAttribute() {
      return null;
    },
  };
  const selected = new Set([first, second]);
  const document = {
    defaultView: {
      getSelection() {
        return {
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt() {
            return {
              intersectsNode(node) {
                return selected.has(node);
              },
            };
          },
        };
      },
    },
    querySelectorAll() {
      return [first, second, outside];
    },
  };

  assert.deepEqual(collectSelectionLinks(document), [
    {
      url: "https://example.com/one.zip",
      description: "One",
      filename: "one.zip",
    },
    {
      url: "https://example.com/two.zip",
      description: "Two",
      filename: "",
    },
  ]);
});

test("selection Actor returns no links for a collapsed selection", () => {
  const document = {
    defaultView: {
      getSelection() {
        return { rangeCount: 0, isCollapsed: true };
      },
    },
    querySelectorAll() {
      throw new Error("collapsed selections must not scan the document");
    },
  };

  assert.deepEqual(collectSelectionLinks(document), []);
});
