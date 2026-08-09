import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  destroyDownloadItToasts,
  showDownloadItToast,
} from "../addon/chrome/content/DownloadItChrome.sys.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(
  path.join(projectRoot, relativePath),
  "utf8",
);

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

  dispatchEvent(event) {
    event.target ||= this;
    this.listeners.get(event.type)?.(event);
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
    windowUtils: {
      AUTHOR_SHEET: 1,
      loadedSheets: [],
      removedSheets: [],
      loadSheetUsingURIString(url, type) {
        this.loadedSheets.push({ url, type });
      },
      removeSheetUsingURIString(url, type) {
        this.removedSheets.push({ url, type });
      },
    },
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
  assert.deepEqual(window.windowUtils.loadedSheets, [{
    url: "chrome://downloadit/content/chrome.css",
    type: window.windowUtils.AUTHOR_SHEET,
  }]);

  destroyDownloadItToasts(window);
  assert.equal(document.getElementById("downloadit-toast-host"), null);
  assert.deepEqual(window.windowUtils.removedSheets, [{
    url: "chrome://downloadit/content/chrome.css",
    type: window.windowUtils.AUTHOR_SHEET,
  }]);
});

test("actionable toast opens AriaNg once from clicks and keyboard activation", () => {
  const document = new MockDocument();
  const timers = [];
  const window = {
    document,
    windowUtils: {
      AUTHOR_SHEET: 1,
      loadSheetUsingURIString() {},
      removeSheetUsingURIString() {},
    },
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  };
  let opened = 0;

  showDownloadItToast(window, "aria2 accepted the task.", {
    onClick: () => {
      opened++;
    },
  });
  const toast = document.getElementById("downloadit-toast-host").children[0];
  const close = toast.children[1];

  assert.equal(toast.getAttribute("role"), "button");
  assert.equal(toast.getAttribute("tabindex"), "0");
  assert.equal(toast.getAttribute("data-l10n-id"), "downloadit-toast-open-ariang");
  toast.dispatchEvent({
    type: "click",
    preventDefault() {},
  });
  toast.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {},
  });
  assert.equal(opened, 1);

  showDownloadItToast(window, "aria2 accepted the task.", {
    onClick: () => {
      opened++;
    },
  });
  const keyboardToast = document.getElementById("downloadit-toast-host").children[1];
  keyboardToast.dispatchEvent({
    type: "keydown",
    key: " ",
    preventDefault() {},
  });
  assert.equal(opened, 2);

  showDownloadItToast(window, "aria2 accepted the task.", {
    onClick: () => {
      opened++;
    },
  });
  const closeOnlyToast = document.getElementById("downloadit-toast-host").children[2];
  closeOnlyToast.children[1].dispatchEvent({
    type: "click",
    stopPropagation() {},
  });
  assert.equal(opened, 2);
  assert.equal(timers.at(-1).delay, 160);
});

test("toast declines windows without a document root", () => {
  assert.equal(showDownloadItToast({}, "message"), false);
});

test("toast uses the browser chrome stylesheet included in both package scripts", () => {
  const toast = read("addon/chrome/content/DownloadItChrome.sys.mjs");
  const styles = read("addon/chrome/content/chrome.css");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const powerShellPack = read("pack.ps1");
  const bashPack = read("pack.sh");

  assert.match(toast, /loadSheetUsingURIString/);
  assert.match(toast, /removeSheetUsingURIString/);
  assert.doesNotMatch(toast, /createElement\(document, "style"\)/);
  assert.match(styles, /#downloadit-toast-host/);
  assert.match(styles, /\.downloadit-toast-close/);
  assert.match(styles, /\.downloadit-toast\.is-actionable/);
  assert.match(service, /destroyDownloadItToasts\(window\)/);
  assert.match(service, /downloader\.ref\.provider === ARIA2NEXT_PROVIDER/);
  assert.match(service, /openAriaNgFromToast\(browserWindow\)/);
  assert.match(powerShellPack, /chrome\/content\/chrome\.css/);
  assert.match(bashPack, /chrome\/content\/chrome\.css/);
});
