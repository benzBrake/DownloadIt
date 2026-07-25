import test from "node:test";
import assert from "node:assert/strict";

import {
  collectPageLinks,
  collectSelectionLinks,
} from "../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs";

function link({
  href,
  text = "",
  download = "",
  ariaLabel = "",
} = {}) {
  return {
    href,
    textContent: text,
    getAttribute(name) {
      return {
        download,
        "aria-label": ariaLabel,
      }[name] || null;
    },
  };
}

test("link collector Actor scans document links and open shadow roots", () => {
  const pageLink = link({
    href: "https://example.com/page.zip",
    text: " Page ",
    download: "page.zip",
  });
  const areaLink = link({
    href: "https://example.com/map.pdf",
    ariaLabel: "Map document",
  });
  const shadowLink = link({
    href: "https://example.com/shadow.mp4",
    text: "Shadow video",
  });
  const shadowRoot = {
    querySelectorAll(selector) {
      return selector === "a[href], area[href]" ? [shadowLink] : [];
    },
  };
  const host = { shadowRoot };
  const document = {
    querySelectorAll(selector) {
      return selector === "a[href], area[href]"
        ? [pageLink, areaLink]
        : [host];
    },
  };

  assert.deepEqual(collectPageLinks(document), [
    {
      url: "https://example.com/page.zip",
      description: "Page",
      filename: "page.zip",
    },
    {
      url: "https://example.com/map.pdf",
      description: "Map document",
      filename: "",
    },
    {
      url: "https://example.com/shadow.mp4",
      description: "Shadow video",
      filename: "",
    },
  ]);
});

test("link collector Actor returns links intersecting the current selection", () => {
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

test("link collector Actor returns no links for a collapsed selection", () => {
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
