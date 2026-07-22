import test from "node:test";
import assert from "node:assert/strict";

import {
  DownloadItDownloadDialogController,
  isDownloadDialogWindow,
} from "../addon/chrome/content/DownloadItDownloadDialog.sys.mjs";

class MockElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.localName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentNode = null;
    this.disabled = false;
    this.hidden = false;
    this.selected = false;
    this.value = "";
  }

  setAttribute(name, value) {
    value = String(value);
    this.attributes.set(name, value);
    if (name === "id") {
      this.ownerDocument.elements.set(value, this);
    } else if (name === "value") {
      this.value = value;
    } else if (name === "selected") {
      this.selected = value !== "false";
    } else if (name === "label") {
      this.label = value;
    } else if (
      name === "collapsed" ||
      name === "disabled" ||
      name === "hidden"
    ) {
      this[name] = value !== "false";
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "selected") {
      this.selected = false;
    } else if (
      name === "collapsed" ||
      name === "disabled" ||
      name === "hidden"
    ) {
      this[name] = false;
    }
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
      if (this.getAttribute("id") === "mode") {
        const pending = [child];
        while (pending.length > 0) {
          const current = pending.shift();
          if (current.getAttribute("id") === "downloadit-download-manager") {
            const popup = current.children.find(
              element => element.localName === "menupopup",
            );
            this.ownerDocument.managerItemCountWhenAttached =
              popup?.children.length ?? null;
            break;
          }
          pending.push(...current.children);
        }
      }
    }
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  remove() {
    this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
    for (const [id, element] of this.ownerDocument.elements) {
      if (element === this || this.contains(element)) {
        this.ownerDocument.elements.delete(id);
      }
    }
  }

  contains(element) {
    return this.children.some(child => child === element || child.contains(element));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter(item => item !== listener),
    );
  }

  dispatch(type, event = {}) {
    const currentEvent = { type, target: this, currentTarget: this, ...event };
    for (const listener of this.listeners.get(type) || []) {
      if (typeof listener === "function") {
        listener(currentEvent);
      } else {
        listener.handleEvent(currentEvent);
      }
    }
  }

  click() {
    this.selected = true;
    this.dispatch("click");
    this.dispatch("command");
  }

  querySelector(selector) {
    if (selector === "menuitem[selected]") {
      return this.children.find(child =>
        child.localName === "menuitem" && child.selected
      ) || null;
    }
    return null;
  }
}

class MockDocument {
  constructor({ withLocalization = true } = {}) {
    this.elements = new Map();
    this.managerItemCountWhenAttached = null;
    this.l10n = withLocalization ? {
      setAttributes: (element, id, args = null) => {
        element.l10nId = id;
        element.l10nArgs = args;
      },
      async translateFragment(element) {
        const pending = [element];
        while (pending.length > 0) {
          const current = pending.shift();
          if (current.l10nId === "downloadit-download-dialog-default-manager") {
            current.setAttribute("label", `${current.l10nArgs.manager} (default)`);
          }
          pending.push(...current.children);
        }
      },
      async formatValue(id, ...formatArgs) {
        if (
          formatArgs.length > 0 &&
          (formatArgs[0] === null || typeof formatArgs[0] !== "object")
        ) {
          throw new TypeError("Localization.formatValue: Argument 2 is not an object");
        }
        const [args] = formatArgs;
        if (id === "downloadit-download-dialog-default-manager") {
          return `${args.manager} (default)`;
        }
        if (id === "downloadit-download-dialog-manager") {
          return "Download manager";
        }
        return `${id}:${JSON.stringify(args || {})}`;
      },
    } : null;
  }

  createXULElement(tagName) {
    return new MockElement(this, tagName);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  addElement(tagName, id) {
    const element = this.createXULElement(tagName);
    element.setAttribute("id", id);
    return element;
  }
}

function createWindow({
  url = "chrome://mozapps/content/downloads/unknownContentType.xhtml",
  source = "https://example.com/file.zip",
  withLocalization = true,
  simplified = false,
} = {}) {
  const document = new MockDocument({ withLocalization });
  const normalBox = document.addElement("vbox", "normalBox");
  const basicBox = document.addElement("hbox", "basicBox");
  const mode = document.addElement("radiogroup", "mode");
  const internalHandler = document.addElement("radio", "handleInternally");
  internalHandler.setAttribute("hidden", "true");
  const openRow = document.createXULElement("hbox");
  const open = document.addElement("radio", "open");
  const openHandler = document.addElement("menulist", "openHandler");
  const chooseButton = document.addElement("button", "chooseButton");
  openRow.append(open);
  const save = document.addElement("radio", "save");
  const rememberChoice = document.addElement("checkbox", "rememberChoice");
  rememberChoice.checked = true;
  const rememberRow = document.createXULElement("hbox");
  rememberRow.append(rememberChoice);
  const settingsChange = document.addElement("description", "settingsChange");
  settingsChange.setAttribute("hidden", "true");
  const location = document.addElement("textbox", "location");
  location.value = "file.zip";
  mode.append(internalHandler, openRow, save);
  normalBox.append(mode, openHandler, chooseButton, rememberRow, settingsChange);
  if (simplified) {
    normalBox.setAttribute("collapsed", "true");
  } else {
    basicBox.setAttribute("collapsed", "true");
  }
  let nativeCalls = 0;
  const window = {
    document,
    location: { href: url },
    closed: false,
    dialog: {
      mLauncher: {
        source: {
          spec: source,
          referrerInfo: {
            originalReferrer: { spec: "https://example.com/" },
          },
        },
        suggestedFileName: "file.zip",
      },
      mContext: null,
      onOK() {
        nativeCalls += 1;
      },
    },
    close() {
      this.closed = true;
    },
    sizeToContentCalls: 0,
    sizeToContent() {
      this.sizeToContentCalls += 1;
    },
    get nativeCalls() {
      return nativeCalls;
    },
  };
  return window;
}

function createService({ fail = false, managers = ["Default", "Other"] } = {}) {
  const calls = [];
  const alerts = [];
  return {
    managers,
    defaultManager: "Default",
    calls,
    alerts,
    async getManagersForDownloadDialog() {
      return [...managers];
    },
    async downloadLauncher(options) {
      calls.push(options);
      if (fail) {
        throw new Error("helper failed");
      }
    },
    alert(window, message) {
      alerts.push({ window, message });
    },
  };
}

function openManagerPopup(controller) {
  controller.managerPopup.dispatch("popupshowing");
  return controller.managerPopup.children;
}

test("download dialog URL matching only accepts the native prompt", () => {
  assert.equal(isDownloadDialogWindow({
    location: { href: "chrome://mozapps/content/downloads/unknownContentType.xhtml?x=1" },
  }), true);
  assert.equal(isDownloadDialogWindow({
    location: { href: "chrome://browser/content/browser.xhtml" },
  }), false);
});

test("dialog shows managers without changing the configured default", async () => {
  const window = createWindow();
  const service = createService();
  const controller = new DownloadItDownloadDialogController(
    service,
    window,
    async () => {},
  );

  assert.equal(await controller.init(), true);
  assert.equal(window.document.managerItemCountWhenAttached, 0);
  assert.equal(controller.radio.l10nId, "downloadit-download-dialog-option");
  const [radio, deck] = controller.option.children;
  const [controls] = deck.children;
  assert.equal(radio, controller.radio);
  assert.equal(deck.localName, "deck");
  assert.deepEqual(controls.children, [controller.manager, controller.action]);
  assert.equal(controller.manager.l10nId, undefined);
  assert.equal(controller.manager.getAttribute("manager"), "Default");
  assert.equal(controller.manager.getAttribute("label"), "Default (default)");
  assert.equal(controller.manager.getAttribute("aria-label"), "Download manager");
  assert.match(controller.manager.getAttribute("style"), /min-height:[^;]+28px/);
  assert.match(controller.manager.getAttribute("style"), /max-height:[^;]+28px/);
  assert.equal(controller.managerPopup.children.length, 0);

  let [defaultItem, otherItem] = openManagerPopup(controller);
  assert.equal(defaultItem.getAttribute("manager"), "Default");
  assert.equal(defaultItem.getAttribute("label"), "Default (default)");
  assert.equal(defaultItem.getAttribute("default"), "true");
  assert.equal(defaultItem.getAttribute("selected"), null);
  assert.equal(otherItem.getAttribute("label"), "Other");

  otherItem.dispatch("command");

  assert.equal(controller.manager.getAttribute("manager"), "Other");
  assert.equal(controller.manager.getAttribute("label"), "Other");
  assert.equal(defaultItem.getAttribute("selected"), null);
  assert.equal(otherItem.getAttribute("selected"), "true");
  assert.equal(service.defaultManager, "Default");
  assert.equal(controller.radio.selected, true);
  assert.equal(window.document.getElementById("rememberChoice").disabled, true);
  assert.equal(window.document.getElementById("rememberChoice").checked, false);

  service.managers = ["Default", "Third"];
  [defaultItem, otherItem] = openManagerPopup(controller);
  assert.equal(controller.managerPopup.children.length, 2);
  assert.equal(defaultItem.getAttribute("manager"), "Default");
  assert.equal(otherItem.getAttribute("manager"), "Third");

  controller.radio.selected = false;
  window.document.getElementById("mode").dispatch("select");
  assert.equal(window.document.getElementById("rememberChoice").disabled, false);
});

test("save-only dialog reveals DownloadIt and disables native open actions", async () => {
  const window = createWindow({ simplified: true });
  const controller = new DownloadItDownloadDialogController(
    createService(),
    window,
    async () => {},
  );

  assert.equal(await controller.init(), true);
  assert.equal(window.document.getElementById("normalBox").collapsed, false);
  assert.equal(window.document.getElementById("basicBox").collapsed, true);
  assert.equal(window.document.getElementById("open").parentNode.hidden, false);
  assert.equal(window.document.getElementById("open").disabled, true);
  assert.equal(window.document.getElementById("openHandler").disabled, true);
  assert.equal(window.document.getElementById("chooseButton").disabled, true);
  assert.equal(window.document.getElementById("handleInternally").hidden, true);
  assert.equal(window.document.getElementById("rememberChoice").parentNode.hidden, false);
  assert.equal(window.document.getElementById("rememberChoice").disabled, true);
  assert.equal(window.document.getElementById("rememberChoice").checked, false);
  assert.equal(controller.option.parentNode, window.document.getElementById("mode"));
  assert.equal(window.sizeToContentCalls, 1);

  controller.radio.selected = false;
  window.document.getElementById("mode").dispatch("select");
  assert.equal(window.document.getElementById("rememberChoice").disabled, true);

  controller.destroy();
  assert.equal(window.document.getElementById("normalBox").collapsed, true);
  assert.equal(window.document.getElementById("basicBox").collapsed, false);
  assert.equal(window.document.getElementById("open").parentNode.hidden, false);
  assert.equal(window.document.getElementById("open").disabled, false);
  assert.equal(window.document.getElementById("openHandler").disabled, false);
  assert.equal(window.document.getElementById("rememberChoice").parentNode.hidden, false);
  assert.equal(window.document.getElementById("rememberChoice").disabled, false);
  assert.equal(window.document.getElementById("rememberChoice").checked, true);
});

test("native OK delegates normally until DownloadIt is selected", async () => {
  const window = createWindow();
  const service = createService();
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();

  window.dialog.onOK();
  assert.equal(window.nativeCalls, 1);

  const [, otherItem] = openManagerPopup(controller);
  otherItem.dispatch("command");
  let prevented = false;
  assert.equal(window.dialog.onOK({
    preventDefault() {
      prevented = true;
    },
  }), false);
  assert.equal(prevented, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.calls[0].manager, "Other");
  assert.equal(window.closed, true);
});

test("DownloadIt action submits the edited filename and closes on success", async () => {
  const window = createWindow();
  const service = createService();
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  const [, otherItem] = openManagerPopup(controller);
  otherItem.dispatch("command");

  controller.action.dispatch("command");
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0].manager, "Other");
  assert.equal(service.calls[0].filename, "file.zip");
  assert.equal(window.closed, true);
});

test("radio double-click submits through the selected manager", async () => {
  const window = createWindow();
  const service = createService();
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  controller.radio.click();
  controller.radio.dispatch("dblclick");
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0].manager, "Default");
  assert.equal(window.closed, true);
});

test("failed external submission keeps the dialog open and reports a localized error", async () => {
  const window = createWindow();
  const service = createService({ fail: true });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  const [, otherItem] = openManagerPopup(controller);
  otherItem.dispatch("command");

  await controller.submitExternal();

  assert.equal(window.closed, false);
  assert.equal(service.alerts.length, 1);
  assert.match(service.alerts[0].message, /downloadit-download-dialog-failed/);
  assert.equal(controller.action.disabled, false);
  assert.equal(controller.manager.disabled, false);
});

test("unsupported URLs, empty manager lists, and missing localization leave native UI intact", async () => {
  for (const [window, service] of [
    [createWindow({ source: "about:config" }), createService()],
    [createWindow(), createService({ managers: [] })],
    [createWindow({ withLocalization: false }), createService()],
  ]) {
    const controller = new DownloadItDownloadDialogController(service, window, async () => {});
    assert.equal(await controller.init(), false);
    assert.equal(window.document.getElementById("downloadit-download-option"), null);
  }
});

test("destroy restores native OK handling and removes injected UI", async () => {
  const window = createWindow();
  const service = createService();
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  const originalOnOK = controller.originalOnOK;
  const managerPopup = controller.managerPopup;
  controller.destroy();

  assert.equal(window.dialog.onOK, originalOnOK);
  assert.equal(window.document.getElementById("downloadit-download-option"), null);
  assert.equal(managerPopup.listeners.get("popupshowing")?.length, 0);
});

test("destroy during asynchronous initialization prevents late injection", async () => {
  const window = createWindow();
  let resolveManagers;
  const service = createService();
  service.getManagersForDownloadDialog = () => new Promise(resolve => {
    resolveManagers = resolve;
  });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  const initialization = controller.init();

  controller.destroy();
  resolveManagers(["Default"]);

  assert.equal(await initialization, false);
  assert.equal(window.document.getElementById("downloadit-download-option"), null);
});
