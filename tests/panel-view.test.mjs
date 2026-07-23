import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOWNLOADIT_PANEL_VIEW_ID,
  DOWNLOADIT_TOOLBAR_WIDGET_ID,
  DownloadItPanelViewController,
} from "../addon/chrome/content/DownloadItPanelView.sys.mjs";

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
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "disabled" || name === "checked" || name === "hidden") {
      this[name] = true;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "disabled" || name === "checked" || name === "hidden") {
      this[name] = false;
    }
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

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentNode = null;
    }
    this.children = [];
    this.append(...children);
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) {
      this.listeners.delete(type);
    }
  }

  querySelector(selector) {
    if (!selector.startsWith("#")) {
      return null;
    }
    const id = selector.slice(1);
    return this.find(element => element.id === id);
  }

  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) {
        return child;
      }
      const nested = child.find?.(predicate);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.translated = [];
    this.viewCache = new MockElement("template", this);
    this.viewCache.setAttribute("id", "appMenu-viewCache");
    this.viewCache.content = new MockElement("fragment", this);
    this.l10n = {
      setAttributes: (element, id, args = null) => {
        element.setAttribute("data-l10n-id", id);
        if (args == null) {
          element.removeAttribute("data-l10n-args");
        } else {
          element.setAttribute("data-l10n-args", JSON.stringify(args));
        }
      },
      translateFragment: async element => {
        this.translated.push(element);
      },
    };
  }

  createXULElement(localName) {
    return new MockElement(localName, this);
  }

  getElementById(id) {
    if (this.viewCache.id === id) {
      return this.viewCache;
    }
    return this.viewCache.content.find(element => element.id === id);
  }
}

class MockService {
  constructor({ managers = null, defaultManager = "flashgot:idm", locked = false } = {}) {
    this.managers = managers ?? [
      {
        key: "flashgot:idm",
        name: "Internet Download Manager",
        custom: false,
        available: true,
      },
      {
        key: "custom:aria2",
        name: "Local aria2",
        custom: true,
        available: true,
      },
    ];
    this.selectedManager = defaultManager;
    this.locked = locked;
    this.settingsWindow = null;
    this.selectionError = null;
    this.refreshCalls = 0;
  }

  get defaultManager() {
    return this.selectedManager;
  }

  set defaultManager(value) {
    if (this.selectionError) {
      throw this.selectionError;
    }
    this.selectedManager = value;
  }

  readSettings() {
    return {
      managers: this.managers.map(manager => ({ ...manager })),
      defaultManager: this.selectedManager,
      defaultManagerLocked: this.locked,
    };
  }

  async refreshManagers() {
    this.refreshCalls += 1;
    return this.managers.filter(manager => !manager.custom).map(manager => manager.name);
  }

  openSettings(window) {
    this.settingsWindow = window;
  }
}

function createController(service = new MockService()) {
  const document = new MockDocument();
  const window = { document };
  const controller = new DownloadItPanelViewController(
    service,
    window,
    async () => {},
  );
  controller.init();
  return { controller, document, service, window };
}

test("panel view builds native manager, refresh, and settings controls", () => {
  const { controller, document } = createController();

  assert.equal(controller.view.localName, "panelview");
  assert.equal(controller.view.id, DOWNLOADIT_PANEL_VIEW_ID);
  assert.equal(
    document.viewCache.content.querySelector(`#${DOWNLOADIT_PANEL_VIEW_ID}`),
    controller.view,
  );
  assert.match(controller.view.getAttribute("class"), /PanelUI-subView/);
  assert.equal(controller.managerButtons.length, 2);
  assert.equal(controller.managerButtons[0].getAttribute("checked"), "true");
  assert.equal(controller.managerButtons[1].getAttribute("checked"), null);
  assert.equal(
    controller.managerButtons[1].getAttribute("data-l10n-id"),
    "downloadit-custom-downloader-menu-label",
  );
  assert.equal(controller.refreshButton.getAttribute("closemenu"), "none");
  assert.equal(controller.managerButtons[0].getAttribute("closemenu"), null);
  assert.equal(
    controller.settingsButton.getAttribute("data-l10n-id"),
    "downloadit-settings",
  );
});

test("manager selection updates only the default manager", () => {
  const { controller, service } = createController();

  assert.equal(controller.selectManager("custom:aria2"), true);
  assert.equal(service.defaultManager, "custom:aria2");
  assert.equal(controller.managerButtons[0].checked, false);
  assert.equal(controller.managerButtons[1].checked, true);
  assert.equal(controller.status.hidden, true);
});

test("locked and empty manager states cannot change the preference", () => {
  const locked = createController(new MockService({ locked: true }));
  assert.equal(locked.controller.managerButtons.every(item => item.disabled), true);
  assert.equal(locked.controller.selectManager("custom:aria2"), false);
  assert.equal(locked.service.defaultManager, "flashgot:idm");
  locked.controller.onViewShowing();
  assert.equal(
    locked.controller.status.getAttribute("data-l10n-id"),
    "downloadit-locked",
  );

  const empty = createController(new MockService({ managers: [], defaultManager: "" }));
  assert.equal(empty.controller.managerButtons.length, 0);
  assert.equal(empty.controller.managerList.children.length, 1);
  assert.equal(
    empty.controller.managerList.children[0].getAttribute("data-l10n-id"),
    "downloadit-no-manager",
  );
  assert.equal(empty.controller.managerList.children[0].disabled, true);
  assert.equal(empty.controller.managerList.children[0].getAttribute("disabled"), "true");
});

test("refresh prevents re-entry and rebuilds the manager list in place", async () => {
  const service = new MockService();
  let finishRefresh;
  service.refreshManagers = () => {
    service.refreshCalls += 1;
    return new Promise(resolve => {
      finishRefresh = () => {
        service.managers = [
          ...service.managers,
          {
            key: "flashgot:fdm",
            name: "Free Download Manager",
            custom: false,
            available: true,
          },
        ];
        resolve(["Internet Download Manager", "Free Download Manager"]);
      };
    });
  };
  const { controller } = createController(service);

  const first = controller.refreshManagers();
  const second = controller.refreshManagers();
  assert.equal(first, second);
  assert.equal(service.refreshCalls, 1);
  assert.equal(controller.refreshButton.disabled, true);
  assert.equal(controller.view.getAttribute("aria-busy"), "true");
  assert.equal(
    controller.status.getAttribute("data-l10n-id"),
    "downloadit-detection-loading",
  );

  finishRefresh();
  assert.deepEqual(await first, ["Internet Download Manager", "Free Download Manager"]);
  assert.equal(controller.managerButtons.length, 3);
  assert.equal(controller.refreshButton.disabled, false);
  assert.equal(controller.view.getAttribute("aria-busy"), "false");
  assert.equal(
    controller.status.getAttribute("data-l10n-id"),
    "downloadit-detection-success",
  );
  assert.deepEqual(
    JSON.parse(controller.status.getAttribute("data-l10n-args")),
    { count: 2 },
  );
});

test("refresh failure preserves managers and exposes the raw error as a Fluent argument", async () => {
  const service = new MockService();
  service.refreshManagers = async () => {
    service.refreshCalls += 1;
    throw new Error("scan exploded");
  };
  const { controller } = createController(service);
  const existingItems = [...controller.managerList.children];

  assert.equal(await controller.refreshManagers(), null);
  assert.deepEqual(controller.managerList.children, existingItems);
  assert.equal(
    controller.status.getAttribute("data-l10n-id"),
    "downloadit-detection-error",
  );
  assert.deepEqual(
    JSON.parse(controller.status.getAttribute("data-l10n-args")),
    { error: "scan exploded" },
  );
});

test("selection errors, settings commands, localization blockers, and cleanup are wired", async () => {
  const { controller, document, service, window } = createController();
  service.selectionError = new Error("preference locked");
  assert.equal(controller.selectManager("custom:aria2"), false);
  assert.equal(
    controller.status.getAttribute("data-l10n-id"),
    "downloadit-panel-selection-error",
  );

  controller.handleEvent({ type: "command", target: controller.settingsButton });
  assert.equal(service.settingsWindow, window);

  let blocker = null;
  controller.onViewShowing({
    detail: {
      addBlocker(value) {
        blocker = value;
      },
    },
  });
  assert.ok(blocker instanceof Promise);
  await blocker;

  controller.destroy();
  assert.equal(document.getElementById(DOWNLOADIT_PANEL_VIEW_ID), null);
});

test("service registers a removable native view widget in the navigation bar", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const panel = read("addon/chrome/content/DownloadItPanelView.sys.mjs");
  const powerShellPack = read("pack.ps1");
  const bashPack = read("pack.sh");

  assert.equal(DOWNLOADIT_TOOLBAR_WIDGET_ID, "downloadit-toolbar-button");
  assert.equal(DOWNLOADIT_PANEL_VIEW_ID, "downloadit-panel-view");
  assert.match(
    service,
    /moz-src:\/\/\/browser\/components\/customizableui\/CustomizableUI\.sys\.mjs/,
  );
  assert.match(service, /resource:\/\/\/modules\/CustomizableUI\.sys\.mjs/);
  assert.match(service, /try \{[\s\S]*moz-src:[\s\S]*\} catch \{[\s\S]*resource:/);
  assert.match(service, /type: "view"/);
  assert.match(service, /viewId: DOWNLOADIT_PANEL_VIEW_ID/);
  assert.match(service, /defaultArea: CustomizableUI\.AREA_NAVBAR/);
  assert.match(service, /removable: true/);
  assert.match(service, /l10nId: "downloadit-toolbar-button"/);
  assert.match(service, /CustomizableUI\.destroyWidget\(DOWNLOADIT_TOOLBAR_WIDGET_ID\)/);
  assert.match(panel, /getElementById\("appMenu-viewCache"\)/);
  assert.match(panel, /viewCache\.content\.appendChild\(this\.view\)/);
  assert.match(panel, /this\.view\?\.remove\(\)/);
  assert.match(powerShellPack, /chrome\/content\/DownloadItPanelView\.sys\.mjs/);
  assert.match(bashPack, /chrome\/content\/DownloadItPanelView\.sys\.mjs/);
});
