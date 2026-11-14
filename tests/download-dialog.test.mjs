import test from "node:test";
import { defaultDownloadDirectories } from "../addon/chrome/content/DownloadItDirectories.sys.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canRememberLauncherExtension,
  DownloadItDownloadDialogController,
  getLauncherExtension,
  normalizeAutoExtensions,
  registerDownloadItHelperAppHook,
  unregisterDownloadItHelperAppHook,
  isDownloadDialogWindow,
} from "../addon/chrome/content/DownloadItDownloadDialog.sys.mjs";

const DOWNLOADIT_ICON = readFileSync(
  new URL("../addon/chrome/content/icons/downloadit.svg", import.meta.url),
  "utf8",
);

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

  getRootNode() {
    return this.parentNode?.getRootNode() || this.ownerDocument;
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

  after(sibling) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    sibling.parentNode = this.parentNode;
    this.parentNode.children.splice(index + 1, 0, sibling);
  }

  insertBefore(child, reference) {
    child.parentNode = this;
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    if (child.getAttribute("id")) {
      this.ownerDocument.elements.set(child.getAttribute("id"), child);
    }
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

  createElementNS(_namespace, tagName) {
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
  const frame = document.addElement("dialog", "unknownContentType");
  const dialogButtons = document.createXULElement("hbox");
  const extra2 = document.addElement("button", "extra2");
  const accept = document.addElement("button", "accept");
  dialogButtons.append(extra2, accept);
  frame.append(dialogButtons);
  frame.getButton = name => document.getElementById(name);
  const sourceRow = document.createXULElement("hbox");
  const sourceElement = document.addElement("label", "source");
  sourceRow.append(sourceElement);
  basicBox.append(sourceRow);
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
  const locationRow = document.createXULElement("hbox");
  locationRow.append(location);
  normalBox.append(locationRow);
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
        MIMEInfo: { MIMEType: "application/zip" },
        targetFileIsExecutable: false,
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

function createService({
  fail = false,
  managers = ["Default", "Other"],
  autoExtensions = [],
  autoDenyExtensions = [],
  autoCaptureRulesError = false,
  downloadDialogSettings = {},
} = {}) {
  const calls = [];
  const alerts = [];
  const remembered = new Set(autoExtensions);
  const denied = new Set(autoDenyExtensions);
  return {
    managers,
    defaultManager: "Default",
    autoCaptureRulesLoadError: autoCaptureRulesError
      ? new Error("invalid automatic capture configuration")
      : null,
    calls,
    alerts,
    downloadDialogSettings,
    getDownloadDialogSettings() {
      return this.downloadDialogSettings;
    },
    remembered,
    denied,
    getAutoCaptureDisposition(extension) {
      if (extension === "xpi" || denied.has(extension)) {
        return "deny";
      }
      return remembered.has(extension) ? "allow" : "default";
    },
    setAutoCaptureRule(extension, disposition) {
      remembered.delete(extension);
      denied.delete(extension);
      if (disposition === "allow") {
        remembered.add(extension);
      } else if (disposition === "deny") {
        denied.add(extension);
      }
    },
    hasAutoExtension(extension) {
      return remembered.has(extension);
    },
    setAutoExtension(extension, enabled) {
      if (enabled) {
        remembered.add(extension);
      } else {
        remembered.delete(extension);
      }
    },
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

test("download dialog icon has an explicit native control size", () => {
  assert.match(DOWNLOADIT_ICON, /<svg\b[^>]*\bwidth="16"/);
  assert.match(DOWNLOADIT_ICON, /<svg\b[^>]*\bheight="16"/);
});

test("automatic extension values are normalized and launcher filenames are parsed", () => {
  assert.deepEqual(
    normalizeAutoExtensions([" ZIP ", ".zip", "tar-gz", "bad.ext", "", "中文", true, 123]),
    ["tar-gz", "zip"],
  );
  assert.equal(
    getLauncherExtension({ suggestedFileName: "Archive.ZIP" }),
    "zip",
  );
  assert.equal(getLauncherExtension({ suggestedFileName: ".profile" }), "");
  assert.equal(getLauncherExtension({ suggestedFileName: "README" }), "");
});

test("automatic extension memory excludes install and unsupported launchers", () => {
  const base = {
    suggestedFileName: "file.zip",
    source: { spec: "https://example.com/file.zip" },
    MIMEInfo: { MIMEType: "application/zip" },
  };
  assert.equal(canRememberLauncherExtension(base), true);
  assert.equal(canRememberLauncherExtension({
    ...base,
    suggestedFileName: "addon.xpi",
  }), false);
  assert.equal(canRememberLauncherExtension({
    ...base,
    MIMEInfo: { MIMEType: "application/x-xpinstall" },
  }), false);
  assert.equal(canRememberLauncherExtension({
    ...base,
    MIMEInfo: {
      MIMEType: "application/octet-stream",
      primaryExtension: "xpi",
    },
  }), false);
  assert.equal(canRememberLauncherExtension({
    ...base,
    source: { spec: "https://example.com/addon.xpi?download=1" },
  }), false);
  assert.equal(canRememberLauncherExtension({
    ...base,
    targetFileIsExecutable: true,
  }), true);
  assert.equal(canRememberLauncherExtension({
    ...base,
    source: { spec: "about:blank" },
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
  assert.equal(window.document.getElementById("rememberChoice").disabled, false);
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
  assert.equal(window.document.getElementById("rememberChoice").disabled, false);
  assert.equal(window.document.getElementById("rememberChoice").checked, true);
  assert.equal(controller.option.parentNode, window.document.getElementById("mode"));
  assert.equal(window.sizeToContentCalls, 1);

  controller.radio.selected = false;
  window.document.getElementById("mode").dispatch("select");
  assert.equal(window.document.getElementById("rememberChoice").disabled, false);

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
  assert.equal(service.remembered.has("zip"), false);
});

test("remembering a DownloadIt extension updates the service after a successful handoff", async () => {
  const window = createWindow();
  const service = createService();
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  controller.radio.click();
  window.document.getElementById("rememberChoice").checked = true;

  await controller.submitExternal();

  assert.equal(service.remembered.has("zip"), true);
  assert.equal(window.closed, true);
});

test("executable launchers can remember their extensions", async () => {
  const window = createWindow();
  window.dialog.mLauncher.suggestedFileName = "setup.exe";
  window.dialog.mLauncher.targetFileIsExecutable = true;
  const service = createService();
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  controller.radio.click();

  assert.equal(window.document.getElementById("rememberChoice").disabled, false);
  assert.equal(window.document.getElementById("rememberChoice").checked, false);
});

test("damaged capture rules show remembered state without allowing edits", async () => {
  const window = createWindow();
  const service = createService({
    autoExtensions: ["zip"],
    autoCaptureRulesError: true,
  });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  controller.radio.click();

  assert.equal(window.document.getElementById("rememberChoice").checked, true);
  assert.equal(window.document.getElementById("rememberChoice").disabled, true);
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

test("failed external submission does not change remembered extension state", async () => {
  const window = createWindow();
  const service = createService({ fail: true, autoExtensions: ["zip"] });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  controller.radio.click();
  window.document.getElementById("rememberChoice").checked = false;

  await controller.submitExternal();

  assert.equal(service.remembered.has("zip"), true);
  assert.equal(window.closed, false);
});

test("unsupported URLs and missing localization leave native UI intact", async () => {
  for (const [window, service] of [
    [createWindow({ source: "about:config" }), createService()],
    [createWindow({ source: "blob:https://example.com/id" }), createService()],
    [createWindow({ source: "data:application/zip;base64,AA==" }), createService()],
    [createWindow({ source: "https://example.com/addon%2Expi" }), createService()],
    [createWindow({ withLocalization: false }), createService()],
  ]) {
    const controller = new DownloadItDownloadDialogController(service, window, async () => {});
    assert.equal(await controller.init(), false);
    assert.equal(window.document.getElementById("downloadit-download-option"), null);
  }
});

test("download dialog filename detection is independent from filename editing", async () => {
  const window = createWindow({ source: "https://example.com/%D6%D0%CE%C4.zip" });
  const service = createService({
    managers: [],
    downloadDialogSettings: {
      detectFilenameEncoding: true,
      editFilename: false,
      showFullURL: false,
      saveAs: false,
      saveTo: false,
      saveAndOpen: false,
    },
  });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});

  assert.equal(await controller.init(), true);
  assert.equal(window.document.getElementById("downloadit-download-option"), null);
  assert.equal(window.document.getElementById("location").value, "中文.zip");
  assert.equal(window.document.getElementById("location").disabled, true);
  const encodingMenu = window.document.getElementById("di-filename-encoding");
  assert.ok(encodingMenu);
  assert.equal(encodingMenu.localName, "button");
  assert.equal(encodingMenu.l10nArgs.mode, "auto");
});

test("copy URL reports both outcomes, restarts feedback, and cleans up on destroy", async () => {
  const window = createWindow();
  const timers = new Map();
  let nextTimer = 0;
  window.setTimeout = callback => {
    timers.set(++nextTimer, callback);
    return nextTimer;
  };
  window.clearTimeout = id => timers.delete(id);
  let reducedMotion = false;
  window.matchMedia = () => ({ matches: reducedMotion });
  let fail = false;
  let copied = null;
  window.Components = { interfaces: {}, classes: {
    "@mozilla.org/widget/clipboardhelper;1": { getService: () => ({
      copyString(value) {
        if (fail) throw new Error("Clipboard unavailable");
        copied = value;
      },
    }) },
  } };
  const controller = new DownloadItDownloadDialogController(createService(), window, async () => {});
  await controller.init();
  const button = window.document.getElementById("di-copy-link");
  let animations = 0;
  let cancellations = 0;
  button.animate = () => {
    animations++;
    return { cancel() { cancellations++; } };
  };
  button.dispatch("command");
  assert.equal(copied, window.dialog.mLauncher.source.spec);
  assert.equal(button.l10nId, "downloadit-dialog-copy-link-success");
  assert.equal(animations, 1);
  fail = true;
  const originalError = console.error;
  try {
    console.error = () => {};
    button.dispatch("command");
  } finally {
    console.error = originalError;
  }
  assert.equal(button.l10nId, "downloadit-dialog-copy-link-failed");
  assert.equal(animations, 2);
  assert.equal(cancellations, 1);
  assert.equal(timers.size, 1);
  const reset = timers.get(controller.copyFeedbackTimer);
  timers.delete(controller.copyFeedbackTimer);
  reset();
  assert.equal(button.l10nId, "downloadit-dialog-copy-link");
  fail = false;
  reducedMotion = true;
  button.dispatch("command");
  assert.equal(button.l10nId, "downloadit-dialog-copy-link-success");
  assert.equal(animations, 2);
  controller.destroy();
  assert.equal(timers.size, 0);
});

test("quick save actions delegate to native dialog handling", async () => {
  const window = createWindow({ source: "https://example.com/%D6%D0.zip" });
  window.Components = { interfaces: {}, classes: {
    "@mozilla.org/file/local;1": { createInstance: () => ({
      initWithPath(path) { this.path = path; }, isAbsolute: () => true,
      exists: () => true, isDirectory: () => true,
    }) },
  } };
  const service = createService({
    downloadDialogSettings: {
      detectFilenameEncoding: true,
      editFilename: true,
      showFullURL: true,
      saveAs: true,
      saveTo: true,
      saveAndOpen: true,
      directories: [{ path: "C:\\Downloads", label: "Downloads" }],
    },
  });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();

  let saveAsCalls = 0;
  let saveToPath = "";
  let nativeSaveCalls = 0;
  controller.saveAs = () => { saveAsCalls += 1; };
  controller.saveTo = path => { saveToPath = path; };
  controller.saveNative = () => { nativeSaveCalls += 1; };

  window.document.getElementById("di-save-as").dispatch("command");
  window.document.getElementById("di-save-to-popup").children
    .find(child => child.localName === "menuitem").dispatch("command");
  window.document.getElementById("locationText").dispatch("dblclick", {
    preventDefault() {},
  });
  window.document.getElementById("di-save-and-open").dispatch("command");

  assert.equal(saveAsCalls, 1);
  assert.equal(saveToPath, "C:\\Downloads");
  assert.equal(nativeSaveCalls, 0);
  assert.equal(window.document.getElementById("open").selected, true);
  assert.equal(window.nativeCalls, 1);
  assert.ok(window.document.getElementById("di-complete-link"));
  const saveToPopup = window.document.getElementById("di-save-to-popup");
  assert.deepEqual(
    saveToPopup.children.filter(child => child.localName === "link")
      .map(link => link.getAttribute("href")),
    [
      "chrome://global/skin/global.css",
      "chrome://global/content/elements/menupopup.css",
    ],
  );
  assert.equal(window.document.getElementById("di-save-to").localName, "button");
  assert.equal(window.document.getElementById("di-save-to").getAttribute("type"), "menu");
  const dialogStyles = [];
  const dialogShadowRoot = {
    host: {},
    querySelector: () => dialogStyles[0] || null,
    appendChild: link => dialogStyles.push(link),
  };
  window.document.getElementById("di-save-to").getRootNode = () => dialogShadowRoot;
  controller.addQuickActionStyles(window.document.getElementById("di-save-to"));
  controller.addQuickActionStyles(window.document.getElementById("di-save-to"));
  assert.equal(dialogStyles.length, 1);
  assert.equal(
    dialogStyles[0].getAttribute("href"),
    "chrome://downloadit/content/download-dialog.css",
  );
  assert.equal(window.document.getElementById("locationText").localName, "input");
  assert.equal(window.document.getElementById("di-filename-row").getAttribute("flex"), "1");
  assert.equal(window.document.getElementById("di-filename-input"), null);
  assert.equal(
    saveToPopup.children.find(child => child.localName === "menuitem")
      .getAttribute("label"),
    "Downloads",
  );
});

test("dialog sizing waits for quick action translations and styles", async () => {
  const window = createWindow();
  const controller = new DownloadItDownloadDialogController(createService(), window, async () => {});
  let releaseStyles;
  const styled = new Promise(resolve => { releaseStyles = resolve; });
  controller.addQuickActionStyles = () => styled;
  const translated = [];
  const translate = window.document.l10n.translateFragment;
  window.document.l10n.translateFragment = async element => {
    await translate(element);
    if (element.localName === "button") translated.push(element.getAttribute("id"));
  };
  const initializing = controller.init();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(translated, ["di-filename-encoding", "di-save-as", "di-save-to", "di-save-and-open"]);
  assert.equal(window.sizeToContentCalls, 0);
  releaseStyles();
  await initializing;
  assert.equal(window.sizeToContentCalls, 1);
});

test("save and open is available for executables without enabling the native Open radio", async () => {
  const window = createWindow({ simplified: true });
  const launcher = window.dialog.mLauncher;
  launcher.targetFileIsExecutable = true;
  const calls = [];
  launcher.setWebProgressListener = listener => calls.push(["listener", listener]);
  launcher.setDownloadToLaunch = (...args) => calls.push(["launch", ...args]);
  window.dialog.onUnload = () => calls.push(["unload"]);
  const controller = new DownloadItDownloadDialogController(createService(), window, async () => {});
  await controller.init();

  const button = window.document.getElementById("di-save-and-open");
  assert.ok(button);
  assert.equal(window.document.getElementById("open").disabled, true);
  button.dispatch("command");
  assert.deepEqual(calls, [["listener", null], ["launch", false, null], ["unload"]]);
  assert.equal(window.closed, true);
  assert.equal(window.nativeCalls, 0);
});

test("disabling save and open hides the executable quick action", async () => {
  const window = createWindow({ simplified: true });
  window.dialog.mLauncher.targetFileIsExecutable = true;
  const controller = new DownloadItDownloadDialogController(
    createService({ downloadDialogSettings: { saveAndOpen: false } }), window, async () => {},
  );
  await controller.init();
  assert.equal(window.document.getElementById("di-save-and-open"), null);
});

test("native Save retains the edited name after dialog teardown and avoids automatic recapture", async () => {
  class MockHelperDialog {
    show() {}
    promptForSaveToFileAsync(...args) {
      this.savedArgs = args;
    }
  }
  const service = createService({ autoExtensions: ["zip"] });
  registerDownloadItHelperAppHook(service, {
    helperDialogConstructor: MockHelperDialog,
  });
  try {
    for (const doubleClick of [false, true]) {
      for (const forcePrompt of [false, true]) {
        const window = createWindow();
        const launcher = window.dialog.mLauncher;
        Object.defineProperty(launcher, "suggestedFileName", {
          value: "file.zip", writable: false,
        });
        const controller = new DownloadItDownloadDialogController(service, window, async () => {});
        await controller.init();
        window.document.getElementById("locationText").value = "改名后的文件.zip";
        // Firefox's onOK schedules a timer; the launcher requests the path only
        // after the dialog and its controller have been torn down.
        let pendingSave;
        controller.originalOnOK = function () {
          assert.equal(this, window.dialog);
          pendingSave = () => {
            const helper = new MockHelperDialog();
            helper.promptForSaveToFileAsync(launcher, "context", launcher.suggestedFileName, ".zip", forcePrompt);
            return helper.savedArgs;
          };
        };
        if (doubleClick) {
          controller.saveNative();
        } else {
          window.document.getElementById("save").click();
          window.dialog.onOK();
        }
        controller.destroy();
        const savedArgs = pendingSave();
        assert.deepEqual(savedArgs, [launcher, "context", "改名后的文件.zip", ".zip", forcePrompt]);
        assert.equal(launcher.suggestedFileName, "file.zip");
        assert.equal(service.calls.length, 0);
        // The override belongs to one launcher and is consumed by one request.
        const next = new MockHelperDialog();
        next.promptForSaveToFileAsync(launcher, "context", "next.zip", ".zip", true);
        assert.equal(next.savedArgs[2], "next.zip");
      }
    }
  } finally {
    unregisterDownloadItHelperAppHook(service);
  }
});

test("Save As and Save To pass the final edited filename to Firefox's launcher", async () => {
  const window = createWindow();
  const directoryFile = {
    path: "C:\\Downloads",
    leafName: "",
    initWithPath(path) { this.path = path; },
    exists: () => true,
    isDirectory: () => true,
    append(name) { this.leafName = name; this.path += `\\${name}`; },
  };
  window.Components = {
    interfaces: { nsIMIMEInfo: { saveToDisk: "save-to-disk" } },
    classes: {
      "@mozilla.org/file/local;1": {
        createInstance: () => ({ ...directoryFile }),
      },
    },
  };
  let promptArgs = null;
  let destination = null;
  window.dialog.mLauncher.setWebProgressListener = () => {};
  window.dialog.promptForSaveToFileAsync = (...args) => { promptArgs = args; };
  window.dialog.mLauncher.saveDestinationAvailable = file => { destination = file; };
  const controller = new DownloadItDownloadDialogController(
    createService({ managers: [] }),
    window,
    async () => {},
  );
  await controller.init();
  window.document.getElementById("locationText").value = "edited-name.zip";

  await controller.saveAs();
  assert.equal(promptArgs[2], "edited-name.zip");
  assert.equal(promptArgs[4], true);

  window.closed = false;
  await controller.saveTo("C:\\Downloads");
  assert.equal(destination.leafName, "edited-name.zip");
  assert.equal(destination.path, "C:\\Downloads\\edited-name.zip");
  assert.equal(window.closed, true);
});

test("Save To includes configured directory-service folders", async () => {
  const window = createWindow();
  const folders = new Map([
    ["Desk", "C:\\Users\\Test\\Desktop"],
    ["Docs", "C:\\Users\\Test\\Documents"],
        ["DfltDwnld", "C:\\Users\\Test\\Downloads"],
  ]);
  window.Components = {
    interfaces: { nsIProperties: "properties", nsIFile: "file" },
    classes: {
      "@mozilla.org/file/directory_service;1": {
        getService: () => ({
          get(key) {
            if (!folders.has(key)) throw new Error("unknown folder");
            const path = folders.get(key);
            return { path, exists: () => true, isDirectory: () => true };
          },
        }),
      },
    },
  };
  const controller = new DownloadItDownloadDialogController(
    createService({ managers: [], downloadDialogSettings: { directories: defaultDownloadDirectories() } }),
    window,
    async () => {},
  );
  await controller.init();
  assert.deepEqual(
    window.document.getElementById("di-save-to-popup").children
      .filter(item => item.localName === "menuitem").map(item => item.l10nId),
    [
      "downloadit-dialog-directory-desktop",
      "downloadit-dialog-directory-documents",
      "downloadit-dialog-directory-downloads",
    ],
  );
});

test("disabling filename encoding leaves Firefox's suggested name editable", async () => {
  const window = createWindow({ source: "https://example.com/%D6%D0%CE%C4.zip" });
  const service = createService({
    managers: [],
    downloadDialogSettings: {
      detectFilenameEncoding: false,
      editFilename: true,
      showFullURL: false,
      saveAs: false,
      saveTo: false,
      saveAndOpen: false,
    },
  });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});

  assert.equal(await controller.init(), true);
  assert.equal(window.document.getElementById("location").value, "file.zip");
  assert.equal(window.document.getElementById("location").disabled, false);
  assert.ok(window.document.getElementById("di-filename-encoding"));
});

test("uncertain URL encoding keeps the raw URL candidate", async () => {
  const window = createWindow({ source: "https://example.com/%FF%FE.zip" });
  window.dialog.mLauncher.suggestedFileName = "replacement-decoding.zip";
  const controller = new DownloadItDownloadDialogController(
    createService({ managers: [], showFullURL: false }),
    window,
    async () => {},
  );

  assert.equal(await controller.init(), true);
  assert.equal(window.document.getElementById("location").value, "%FF%FE.zip");
});

test("response-provided filenames are not re-decoded from the URL", async () => {
  const window = createWindow({ source: "https://example.com/%D6%D0%CE%C4.zip" });
  window.dialog.mLauncher.channel = {
    contentDispositionFilename: "server-name.zip",
  };
  window.dialog.mLauncher.suggestedFileName = "server-name.zip";
  window.document.getElementById("location").value = "server-name.zip";
  const controller = new DownloadItDownloadDialogController(
    createService({ managers: [], showFullURL: false }),
    window,
    async () => {},
  );

  assert.equal(await controller.init(), true);
  assert.equal(window.document.getElementById("location").value, "server-name.zip");
  assert.equal(window.document.getElementById("di-filename-encoding"), null);
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

test("helper-app hooks automatically hand off remembered extensions and restore cleanly", async () => {
  const originalComponents = globalThis.Components;
  globalThis.Components = { results: { NS_BINDING_ABORTED: "aborted" } };
  class MockHelperDialog {
    show(...args) {
      this.originalShowArgs = args;
      this.originalShowCalls = (this.originalShowCalls || 0) + 1;
    }

    promptForSaveToFileAsync(...args) {
      this.originalPromptArgs = args;
      this.originalPromptCalls = (this.originalPromptCalls || 0) + 1;
    }
  }

  const calls = [];
  const service = {
    defaultManager: "Default",
    hasAutoExtension: extension => extension === "zip",
    async downloadLauncher(options) {
      calls.push(options);
    },
  };
  const launcher = {
    source: { spec: "https://example.com/file.zip" },
    suggestedFileName: "file.zip",
    MIMEInfo: { MIMEType: "application/zip" },
    cancelReason: null,
    cancel(reason) {
      this.cancelReason = reason;
    },
  };
  const dialog = new MockHelperDialog();
  try {
    assert.equal(registerDownloadItHelperAppHook(service, {
      helperDialogConstructor: MockHelperDialog,
    }), true);
    const registeredShow = MockHelperDialog.prototype.show;
    assert.equal(registerDownloadItHelperAppHook(service, {
      helperDialogConstructor: MockHelperDialog,
    }), true);
    assert.equal(MockHelperDialog.prototype.show, registeredShow);
    dialog.show(launcher, "context", 0);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].manager, "Default");
    assert.equal(dialog.originalShowCalls || 0, 0);
    assert.equal(launcher.cancelReason, "aborted");

    const promptLauncher = {
      ...launcher,
      cancelReason: null,
      destination: "unset",
      saveDestinationAvailable(value) {
        this.destination = value;
      },
    };
    dialog.promptForSaveToFileAsync(promptLauncher, "context", "file.zip", ".zip", false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 2);
    assert.equal(promptLauncher.destination, null);

    const wrappedShow = MockHelperDialog.prototype.show;
    unregisterDownloadItHelperAppHook(service);
    assert.notEqual(MockHelperDialog.prototype.show, wrappedShow);
  } finally {
    unregisterDownloadItHelperAppHook(service);
    if (originalComponents === undefined) {
      delete globalThis.Components;
    } else {
      globalThis.Components = originalComponents;
    }
  }
});

test("helper-app hooks route magnet and ed2k links through protocol defaults", async () => {
  const originalComponents = globalThis.Components;
  globalThis.Components = { results: { NS_BINDING_ABORTED: "aborted" } };
  const calls = [];
  const service = {
    defaultManager: "generic",
    getProtocolDefaultManager(protocol) {
      return protocol === "magnet" ? "magnet-manager" : "ed2k-manager";
    },
    async downloadLauncher(args) {
      calls.push(args);
    },
  };
  class MockHelperDialog {
    show() {
      this.showCalls = (this.showCalls || 0) + 1;
    }
  }
  const launchers = [
    {
      source: { spec: "magnet:?xt=urn:btih:test" },
      suggestedFileName: "",
      MIMEInfo: {},
      cancel(reason) { this.cancelReason = reason; },
    },
    {
      source: { spec: "ed2k://|file|Example.bin|4|0123456789ABCDEF|/" },
      suggestedFileName: "",
      MIMEInfo: {},
      cancel(reason) { this.cancelReason = reason; },
    },
  ];
  const dialog = new MockHelperDialog();
  registerDownloadItHelperAppHook(service, {
    helperDialogConstructor: MockHelperDialog,
  });
  try {
    for (const launcher of launchers) {
      dialog.show(launcher, null, 0);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.map(call => call.manager), [
      "magnet-manager",
      "ed2k-manager",
    ]);
    assert.equal(launchers[0].cancelReason, "aborted");
    assert.equal(launchers[1].cancelReason, "aborted");
  } finally {
    unregisterDownloadItHelperAppHook(service);
    if (originalComponents === undefined) {
      delete globalThis.Components;
    } else {
      globalThis.Components = originalComponents;
    }
  }
});

test("helper-app hooks keep protocol links native when their protocol default is absent", async () => {
  const originalComponents = globalThis.Components;
  globalThis.Components = { results: { NS_BINDING_ABORTED: "aborted" } };
  const calls = [];
  let nativeShows = 0;
  const service = {
    defaultManager: "generic",
    defaultDownloader: { ref: { provider: "flashgot" } },
    getProtocolDefaultManager() {
      return "";
    },
    getAutoCaptureDisposition() {
      return "allow";
    },
    async downloadLauncher(args) {
      calls.push(args);
    },
  };
  class MockHelperDialog {
    show() {
      nativeShows += 1;
    }
  }
  const launcher = {
    source: { spec: "magnet:?xt=urn:btih:test" },
    suggestedFileName: "Example.bin",
    MIMEInfo: { primaryExtension: "bin" },
    cancel(reason) { this.cancelReason = reason; },
  };
  registerDownloadItHelperAppHook(service, {
    helperDialogConstructor: MockHelperDialog,
  });
  try {
    new MockHelperDialog().show(launcher, null, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nativeShows, 1);
    assert.equal(calls.length, 0);
    assert.equal(launcher.cancelReason, undefined);
  } finally {
    unregisterDownloadItHelperAppHook(service);
    if (originalComponents === undefined) {
      delete globalThis.Components;
    } else {
      globalThis.Components = originalComponents;
    }
  }
});

test("helper-app hooks keep denied and browser-native targets in Firefox", async () => {
  class MockHelperDialog {
    show() {
      this.showCalls = (this.showCalls || 0) + 1;
    }
  }

  let downloadCalls = 0;
  const service = {
    defaultManager: "Default",
    getAutoCaptureDisposition: () => "deny",
    hasAutoExtension: () => true,
    async downloadLauncher() {
      downloadCalls += 1;
    },
  };
  const dialog = new MockHelperDialog();
  const base = {
    source: { spec: "https://example.com/file.zip" },
    suggestedFileName: "file.zip",
    MIMEInfo: { MIMEType: "application/zip" },
  };

  registerDownloadItHelperAppHook(service, {
    helperDialogConstructor: MockHelperDialog,
  });
  try {
    dialog.show(base, null, 0);
    service.getAutoCaptureDisposition = () => "allow";
    dialog.show({
      ...base,
      source: { spec: "https://example.com/addon.xpi?download=1" },
      suggestedFileName: "addon.xpi",
    }, null, 0);
    dialog.show({
      ...base,
      source: { spec: "blob:https://example.com/id" },
    }, null, 0);
    dialog.show({
      ...base,
      source: { spec: "data:application/zip;base64,AA==" },
    }, null, 0);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(dialog.showCalls, 4);
    assert.equal(downloadCalls, 0);
  } finally {
    unregisterDownloadItHelperAppHook(service);
  }
});

test("helper-app hooks do not intercept a prompt from an already-open native dialog", async () => {
  class MockHelperDialog {
    show() {}

    promptForSaveToFileAsync() {
      this.promptCalls = (this.promptCalls || 0) + 1;
    }
  }
  const service = {
    defaultManager: "Default",
    hasAutoExtension: extension => extension === "zip",
    async downloadLauncher() {
      throw new Error("should not be called");
    },
  };
  const dialog = new MockHelperDialog();
  dialog.mDialog = {};
  const launcher = {
    source: { spec: "https://example.com/file.zip" },
    suggestedFileName: "file.zip",
    MIMEInfo: { MIMEType: "application/zip" },
  };
  registerDownloadItHelperAppHook(service, { helperDialogConstructor: MockHelperDialog });
  try {
    dialog.promptForSaveToFileAsync(launcher, null, "file.zip", ".zip", false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.promptCalls, 1);
  } finally {
    unregisterDownloadItHelperAppHook(service);
  }
});

test("helper-app hooks leave remembered downloads native for the Firefox provider", async () => {
  class MockHelperDialog {
    show() {
      this.showCalls = (this.showCalls || 0) + 1;
    }
  }
  let downloadCalls = 0;
  const service = {
    defaultManager: '{"provider":"native","id":"firefox"}',
    defaultDownloader: { ref: { provider: "native", id: "firefox" } },
    hasAutoExtension: extension => extension === "zip",
    async downloadLauncher() {
      downloadCalls++;
    },
  };
  const dialog = new MockHelperDialog();
  const launcher = {
    source: { spec: "https://example.com/file.zip" },
    suggestedFileName: "file.zip",
    MIMEInfo: { MIMEType: "application/zip" },
  };
  registerDownloadItHelperAppHook(service, { helperDialogConstructor: MockHelperDialog });
  try {
    dialog.show(launcher, null, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.showCalls, 1);
    assert.equal(downloadCalls, 0);
  } finally {
    unregisterDownloadItHelperAppHook(service);
  }
});

test("helper-app hook shutdown preserves methods replaced by another owner", () => {
  class MockHelperDialog {
    show() {}
  }
  const service = {
    defaultManager: "",
    hasAutoExtension: () => false,
  };
  const replacement = function () {};
  registerDownloadItHelperAppHook(service, { helperDialogConstructor: MockHelperDialog });
  try {
    MockHelperDialog.prototype.show = replacement;
  } finally {
    unregisterDownloadItHelperAppHook(service);
  }
  assert.equal(MockHelperDialog.prototype.show, replacement);
});

test("helper-app hooks submit a launcher at most once while it is pending", async () => {
  class MockHelperDialog {
    show() {
      this.showCalls = (this.showCalls || 0) + 1;
    }
  }
  let resolveDownload;
  let calls = 0;
  const service = {
    defaultManager: "Default",
    hasAutoExtension: () => true,
    downloadLauncher() {
      calls += 1;
      return new Promise(resolve => {
        resolveDownload = resolve;
      });
    },
  };
  const dialog = new MockHelperDialog();
  const launcher = {
    source: { spec: "https://example.com/file.zip" },
    suggestedFileName: "file.zip",
    MIMEInfo: { MIMEType: "application/zip" },
    cancel() {},
  };
  registerDownloadItHelperAppHook(service, { helperDialogConstructor: MockHelperDialog });
  try {
    dialog.show(launcher, null, 0);
    dialog.show(launcher, null, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    resolveDownload();
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    unregisterDownloadItHelperAppHook(service);
  }
});

test("helper-app hooks fall back for unremembered, forced, and failed downloads", async () => {
  class MockHelperDialog {
    show() {
      this.showCalls = (this.showCalls || 0) + 1;
    }

    promptForSaveToFileAsync() {
      this.promptCalls = (this.promptCalls || 0) + 1;
    }
  }
  const service = {
    defaultManager: "Default",
    hasAutoExtension: extension => extension === "zip",
    async downloadLauncher() {
      throw new Error("failed");
    },
  };
  const dialog = new MockHelperDialog();
  const launcher = {
    source: { spec: "https://example.com/file.zip" },
    suggestedFileName: "file.zip",
    MIMEInfo: { MIMEType: "application/zip" },
    saveDestinationAvailable() {},
  };
  registerDownloadItHelperAppHook(service, { helperDialogConstructor: MockHelperDialog });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    dialog.show({ ...launcher, suggestedFileName: "file.txt" }, null, 0);
    dialog.show(launcher, null, 0);
    dialog.promptForSaveToFileAsync(launcher, null, "file.zip", ".zip", false);
    dialog.promptForSaveToFileAsync(launcher, null, "file.zip", ".zip", true);
    await new Promise(resolve => setImmediate(resolve));
    dialog.promptForSaveToFileAsync(launcher, null, "file.zip", ".zip", false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialog.showCalls, 2);
    assert.equal(dialog.promptCalls, 2);
  } finally {
    console.error = originalConsoleError;
    unregisterDownloadItHelperAppHook(service);
  }
});

test("an explicit empty directory list never inserts built-in menu items", async () => {
  const window = createWindow();
  const controller = new DownloadItDownloadDialogController(
    createService({ managers: [], downloadDialogSettings: { directoryFormat: 1, directories: [] } }),
    window, async () => {},
  );
  await controller.init();
  assert.equal(window.document.getElementById("di-save-to-popup").children
    .filter(item => item.localName === "menuitem").length, 0);
});


test("encoding button decodes original bytes and supports custom encodings and automatic reset", async () => {
  const window = createWindow({ source: "https://example.com/%EF%F0%E8%E2%E5%F2.txt" });
  const service = createService({ downloadDialogSettings: {
    editFilename: true, detectFilenameEncoding: false, filenameEncodings: ["windows-1251", "cp1251"],
  } });
  const controller = new DownloadItDownloadDialogController(service, window, async () => {});
  await controller.init();
  const input = window.document.getElementById("locationText");
  const menu = window.document.getElementById("di-filename-encoding");
  const popup = window.document.getElementById("di-filename-encoding-popup");
  assert.equal(menu.parentNode, input.parentNode);
  assert.ok(input.parentNode.children.indexOf(menu) > input.parentNode.children.indexOf(input));
  const custom = popup.children.filter(item => /^(windows-1251|cp1251)$/.test(item.value));
  assert.equal(custom.length, 1);
  input.value = "edited.txt";
  popup.dispatch("command", { target: custom[0] });
  assert.equal(input.value, "привет.txt");
  input.value = "edited-again.txt";
  popup.dispatch("command", { target: custom[0] });
  assert.equal(input.value, "привет.txt");
  const invalid = popup.children.find(item => item.value === "UTF-8");
  assert.equal(invalid.disabled, true);
  popup.dispatch("command", { target: invalid });
  assert.equal(input.value, "привет.txt");
  popup.dispatch("command", { target: popup.children[0] });
  assert.equal(menu.l10nArgs.mode, "auto");
  assert.equal(input.value, "привет.txt");
  popup.dispatch("command", { target: popup.children[1] });
  assert.equal(input.value, "file.zip");
  controller.destroy();
  assert.equal(Boolean(window.document.getElementById("di-filename-encoding")), false);
});
