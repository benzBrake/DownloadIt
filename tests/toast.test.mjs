import test from "node:test";
import assert from "node:assert/strict";

import { showDownloadItToast } from "../addon/chrome/content/DownloadItToast.sys.mjs";

class MockElement {
  constructor(localName, ownerDocument) {
    this.localName = localName;
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
    };
    this.classes = new Set();
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  set className(value) {
    this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...children) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  appendChild(child) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement("html", this);
    this.body = new MockElement("body", this);
    this.documentElement.appendChild(this.body);
    this.localized = [];
    this.l10n = {
      setAttributes: (element, id, args = null) => {
        this.localized.push({ element, id, args });
        element.setAttribute("data-l10n-id", id);
      },
    };
  }

  createElementNS(_namespace, name) {
    return new MockElement(name, this);
  }

  getElementById(id) {
    const find = element => {
      if (element.id === id) {
        return element;
      }
      for (const child of element.children) {
        const match = find(child);
        if (match) {
          return match;
        }
      }
      return null;
    };
    return find(this.documentElement);
  }
}

test("toast is local to its browser document and exposes localized controls", () => {
  const document = new MockDocument();
  const timers = [];
  const window = {
    document,
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  };

  assert.equal(showDownloadItToast(window, "aria2 accepted the task."), true);
  const host = document.getElementById("downloadit-toast-host");
  const toast = host.children[0];
  const content = toast.children[0];
  const close = toast.children[1];

  assert.equal(host.getAttribute("aria-live"), "polite");
  assert.equal(toast.getAttribute("role"), "status");
  assert.equal(content.children[1].textContent, "aria2 accepted the task.");
  assert.equal(toast.classes.has("is-visible"), true);
  assert.equal(close.getAttribute("data-l10n-id"), "downloadit-toast-close");
  assert.deepEqual(document.localized.map(value => value.id), [
    "downloadit-toast-title",
    "downloadit-toast-close",
  ]);
  assert.equal(timers.at(-1).delay, 3500);
});

test("toast declines windows without a document root", () => {
  assert.equal(showDownloadItToast({}, "message"), false);
});
