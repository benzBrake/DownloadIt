import test from "node:test";
import assert from "node:assert/strict";
import { cleanDownloadHistory, DownloadItHistoryController, DownloadItHistoryIntegration, HISTORY_CLEANUP_PREF } from "../addon/chrome/content/DownloadItHistory.sys.mjs";

function record(download, enabled = true) {
  const commands = [];
  return { commands, _shell: { download,
    isCommandEnabled: command => command === "cmd_delete" && enabled,
    doCommand: command => commands.push(command),
  } };
}

test("failed cleanup deletes only failed records through enabled native commands", async () => {
  const failed = record({ error: {} });
  const blocked = record({ error: {} }, false);
  const success = record({ succeeded: true });
  const canceled = record({ canceled: true });
  const running = record({ stopped: false });
  await cleanDownloadHistory([failed, blocked, success, canceled, running], "failed");
  assert.deepEqual(failed.commands, ["cmd_delete"]);
  for (const item of [blocked, success, canceled, running]) assert.deepEqual(item.commands, []);
});

test("unavailable cleanup refreshes successful files before deleting records", async () => {
  const make = exists => record({ succeeded: true, target: { path: "/file", exists: !exists },
    async refresh() { this.target.exists = exists; },
  });
  const missing = make(false), present = make(true);
  const failed = record({ error: {}, target: { path: "/file", exists: false } });
  const noPath = record({ succeeded: true, target: {} });
  await cleanDownloadHistory([missing, present, failed, noPath], "unavailable");
  assert.deepEqual(missing.commands, ["cmd_delete"]);
  for (const item of [present, failed, noPath]) assert.deepEqual(item.commands, []);
});

test("disabling integration during refresh stops deletion", async () => {
  let active = true;
  const item = record({ succeeded: true, target: { path: "/file", exists: false },
    async refresh() { active = false; },
  });
  await cleanDownloadHistory([item], "unavailable", () => active);
  assert.deepEqual(item.commands, []);
});

function fixture() {
  const nodes = new Map();
  const listeners = new Map();
  let disconnected = false;
  const clear = { hidden: true, after: button => nodes.set(button.id, button) };
  const list = { children: [record({ error: {} })] };
  nodes.set("clearDownloadsButton", clear);
  nodes.set("downloadsListBox", list);
  const document = {
    readyState: "complete", documentElement: {},
    l10n: { ready: Promise.resolve(), setAttributes(node, id) { node.l10n = id; } },
    getElementById: id => nodes.get(id),
    createXULElement: () => ({ classList: { add() {} }, style: {},
      addEventListener() {}, after(button) { nodes.set(button.id, button); },
      remove() { nodes.delete(this.id); },
    }),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const window = { document, location: { href: "chrome://browser/content/places/places.xhtml" },
    MutationObserver: class { observe() {} disconnect() { disconnected = true; } },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  return { window, nodes, clear, list, listeners, disconnected: () => disconnected };
}

test("history buttons follow native toolbar visibility and clean up on destruction", async () => {
  const f = fixture();
  const controller = new DownloadItHistoryController(f.window, async () => {});
  await controller.init();
  assert.equal(controller.buttons.length, 2);
  assert.ok(controller.buttons.every(button => button.hidden));
  f.clear.hidden = false;
  controller.update();
  assert.equal(controller.buttons[0].hidden, false);
  assert.equal(controller.buttons[0].disabled, false);
  assert.equal(controller.buttons[1].disabled, true);
  f.list.children = [];
  controller.update();
  assert.ok(controller.buttons.every(button => button.disabled));
  controller.destroy();
  assert.ok(f.disconnected());
  assert.equal(f.nodes.size, 2);
  assert.equal(f.listeners.size, 0);
});

test("integration defaults on, applies toggles to existing windows and removes observers", async () => {
  const f = fixture();
  let enabled = true;
  const observers = new Set();
  const services = {
    obs: { addObserver: (_, topic) => observers.add(topic), removeObserver: (_, topic) => observers.delete(topic) },
    prefs: {
      addObserver: name => observers.add(name), removeObserver: name => observers.delete(name),
      getBoolPref(name, fallback) { assert.equal(name, HISTORY_CLEANUP_PREF); assert.equal(fallback, true); return enabled; },
    },
    wm: { getEnumerator() { let more = true; return { hasMoreElements: () => more, getNext() { more = false; return f.window; } }; } },
  };
  const integration = new DownloadItHistoryIntegration(services, async () => {});
  integration.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(integration.controllers.size, 1);
  enabled = false;
  integration.observe(null, "nsPref:changed");
  assert.equal(integration.controllers.size, 0);
  assert.equal(f.nodes.size, 2);
  enabled = true;
  integration.observe(null, "nsPref:changed");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(integration.controllers.size, 1);
  integration.stop();
  assert.equal(observers.size, 0);
  assert.equal(f.listeners.size, 0);
});

test("new windows wait past a complete initial blank document and ignore subframe loads", async () => {
  const f = fixture();
  f.window.location.href = "about:blank";
  const integration = new DownloadItHistoryIntegration({}, async () => {});
  integration.enabled = true;
  integration.observe(f.window, "domwindowopened");
  assert.equal(integration.pending.size, 1);
  f.listeners.get("load")({ target: f.window.document });
  assert.equal(integration.pending.size, 1);
  f.window.location.href = "chrome://browser/content/places/places.xhtml";
  f.listeners.get("load")({ target: {} });
  assert.equal(integration.controllers.size, 0);
  f.listeners.get("load")({ target: f.window.document });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(integration.pending.size, 0);
  assert.equal(integration.controllers.size, 1);
  assert.equal(f.nodes.get("downloadit-history-failed").l10n, "downloadit-history-remove-failed");
  integration.clear();
  assert.equal(f.listeners.size, 0);
});

test("closing or disabling a window before its load removes pending listeners", () => {
  for (const close of [true, false]) {
    const f = fixture();
    const integration = new DownloadItHistoryIntegration({}, async () => {});
    integration.enabled = true;
    integration.observe(f.window, "domwindowopened");
    if (close) integration.observe(f.window, "domwindowclosed");
    else integration.clear();
    assert.equal(integration.pending.size, 0);
    assert.equal(f.listeners.size, 0);
  }
});
