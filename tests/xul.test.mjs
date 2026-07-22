import test from "node:test";
import assert from "node:assert/strict";

import { createXULElement } from "../addon/chrome/content/DownloadItXUL.sys.mjs";

class MockElement {
  constructor(tagName) {
    this.localName = tagName;
    this.attributes = new Map();
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...children) {
    this.children.push(...children);
  }
}

class MockDocument {
  createXULElement(tagName) {
    this.createdTagName = tagName;
    return new MockElement(tagName);
  }
}

test("createXULElement creates a native XUL element with normalized attributes", () => {
  const document = new MockDocument();
  const element = createXULElement(document, "menuitem", {
    label: "DownloadIt",
    count: 2,
    enabled: true,
    disabled: false,
    omitted: null,
    missing: undefined,
  });

  assert.equal(document.createdTagName, "menuitem");
  assert.equal(element.localName, "menuitem");
  assert.deepEqual([...element.attributes], [
    ["label", "DownloadIt"],
    ["count", "2"],
    ["enabled", "true"],
  ]);
});

test("createXULElement appends children in the supplied order", () => {
  const document = new MockDocument();
  const firstChild = new MockElement("label");
  const secondChild = new MockElement("image");

  const element = createXULElement(
    document,
    "hbox",
    {},
    [firstChild, secondChild],
  );

  assert.deepEqual(element.children, [firstChild, secondChild]);
});
