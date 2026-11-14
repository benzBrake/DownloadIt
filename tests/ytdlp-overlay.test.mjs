import test from "node:test";
import assert from "node:assert/strict";
import { DownloadItLinkCollectorChild, DownloadItLinkCollectorParent } from "../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs";

function fixture() {
  const timers = new Map();
  let timerId = 0;
  const document = {
    location: { href: "https://example.com/watch?list=1" },
    defaultView: { innerWidth: 800, innerHeight: 600,
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id), removeEventListener() {},
    },
    removeEventListener() {},
  };
  class Element {
    constructor(tag) {
      this.localName = tag;
      this.children = [];
      this.style = {};
      this.attributes = {};
      this.listeners = {};
      this.hidden = false;
      this.offsetHeight = 160;
      this.offsetWidth = 240;
      this.isConnected = true;
      this.classes = new Set();
      this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { for (const child of children) { this.children.push(child); child.parentNode = this; } }
    appendChild(child) { this.append(child); return child; }
    replaceChildren() { this.children = []; }
    get firstChild() { return this.children[0]; }
    get firstElementChild() { return this.firstChild; }
    attachShadow() { this.shadow = new Element("shadow"); return this.shadow; }
    cloneNode() { const clone = new Element(this.localName); clone.attributes = { ...this.attributes }; clone.append(...this.children.map(child => child.cloneNode())); return clone; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    focus() { document.activeElement = this; }
    remove() { this.isConnected = false; }
    getBoundingClientRect() { return { left: 20, top: 480, bottom: 520, right: 700, width: 680, height: 40 }; }
    click() { this.listeners.click?.({ preventDefault() {}, stopPropagation() {} }); }
  }
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_ns, tag) => new Element(tag);
  document.body = new Element("body");
  document.documentElement = document.body;
  const actor = new DownloadItLinkCollectorChild();
  actor.document = document;
  actor.label = "使用 yt-dlp 下载";
  actor.ytDlpEnabled = true;
  actor.supportProbeResult = true;
  actor.supportProbeURL = document.location.href;
  const sent = [];
  actor.sendAsyncMessage = (name, data) => sent.push({ name, data });
  actor.sendQuery = async () => ({ menuLabel: "yt-dlp 下载菜单", presets: [
    { id: "video", label: "下载视频" }, { id: "audio", label: "提取音频" },
  ] });
  actor.ensureVideoButton();
  const video = new Element("video");
  const key = (value, target) => actor.handleMenuKey({ key: value, target, preventDefault() {}, stopPropagation() {} });
  return { actor, document, sent, timers, video, key };
}

test("floating arrow opens a localized menu and dispatches only the selected preset ID", async () => {
  const { actor, document, sent, video } = fixture();
  await actor.refreshVideoMenu();
  actor.showVideoButton(video);
  assert.equal(actor.menuButton.hidden, false);
  assert.equal(actor.menuButton.attributes["aria-label"], "yt-dlp 下载菜单");
  assert.equal(actor.menu.hidden, true);
  actor.menuButton.click();
  assert.equal(actor.menu.hidden, false);
  assert.equal(actor.menuButton.attributes["aria-expanded"], "true");
  assert.equal(document.activeElement, actor.menu.children[0]);
  assert.equal(actor.menu.classes.has("above"), true);
  actor.menu.children[1].click();
  assert.deepEqual(sent, [{ name: "DownloadIt:DownloadVideo", data: { presetId: "audio" } }]);
  assert.equal(actor.host.style.display, "none");
  assert.equal(actor.menu.hidden, true);
  actor.showVideoButton(video);
  actor.button.click();
  assert.equal(sent[1].data.presetId, null);
});

test("floating menu supports arrows, Home/End, Escape, Tab, outside clicks and cleanup", async () => {
  const { actor, document, video, key, timers } = fixture();
  await actor.refreshVideoMenu();
  actor.showVideoButton(video);
  key("ArrowUp", actor.menuButton);
  assert.equal(document.activeElement, actor.menu.children[1]);
  key("ArrowDown", actor.menu.children[1]);
  assert.equal(document.activeElement, actor.menu.children[0]);
  key("End", actor.menu.children[0]);
  assert.equal(document.activeElement, actor.menu.children[1]);
  key("Home", actor.menu.children[1]);
  assert.equal(document.activeElement, actor.menu.children[0]);
  actor.scheduleHide();
  assert.equal(timers.size, 0);
  key("Escape", actor.menu.children[0]);
  assert.equal(actor.menu.hidden, true);
  assert.equal(document.activeElement, actor.menuButton);
  actor.menuButton.click();
  key("Tab", actor.menu.children[0]);
  assert.equal(actor.menu.hidden, true);
  assert.equal(document.activeElement, actor.menuButton);
  actor.menuButton.click();
  actor.handleEvent({ type: "pointerdown", composedPath: () => [document.body] });
  assert.equal(actor.host.style.display, "none");
  const host = actor.host;
  actor.cleanupVideoButton();
  assert.equal(host.isConnected, false);
  assert.equal(actor.menu, null);
  assert.equal(actor.menuButton, null);
});

test("menu updates keep support probes intact and stale/local-navigation actions cannot launch", async () => {
  const { actor, document, sent } = fixture();
  let probes = 0;
  actor.probeCurrentPage = () => probes++;
  actor.setYtDlpEnabled(true);
  assert.equal(probes, 0);
  assert.equal(actor.supportProbeResult, true);
  document.location.href = "https://example.com/other";
  actor.downloadPreset("audio");
  assert.equal(sent.length, 0);
  let resolve;
  actor.sendQuery = () => new Promise(done => { resolve = done; });
  const pending = actor.refreshVideoMenu();
  actor.didDestroy();
  resolve({ presets: [{ id: "stale", label: "stale" }] });
  await pending;
  assert.equal(actor.menu, null);
});

test("parent formats menu labels with Fluent and uses its own page URL and preset configuration", async () => {
  const previous = globalThis.ChromeUtils;
  const calls = [];
  const translations = [];
  const window = { document: { l10n: {
    ready: Promise.resolve(),
    async formatValue(id, args) { translations.push({ id, args }); return args?.name || id; },
  } } };
  const service = {
    ytDlpEnabled: true,
    ytDlpPresets: [
      { id: "audio", name: "", enabled: true },
      { id: "custom-test", name: "自定义", enabled: true },
      { id: "video", name: "", enabled: false },
    ],
    async downloadViaYtDlp(...args) { calls.push(args); },
  };
  globalThis.ChromeUtils = { importESModule(spec) {
    if (spec.endsWith("DownloadItService.sys.mjs")) return { getActiveService: () => service };
    if (spec.endsWith("DownloadItLocalization.sys.mjs")) return { async initializeDownloadItLocalization() {} };
    throw new Error(`Unexpected import ${spec}`);
  } };
  try {
    const actor = new DownloadItLinkCollectorParent();
    actor.browsingContext = {
      top: { embedderElement: { ownerDocument: { defaultView: window } } },
      currentWindowGlobal: { documentURI: { spec: "https://example.com/authoritative" } },
    };
    const data = await actor.receiveMessage({ name: "DownloadIt:GetVideoMenu" });
    assert.deepEqual(data.presets, [
      { id: "audio", label: "downloadit-ytdlp-preset-audio" },
      { id: "custom-test", label: "自定义" },
    ]);
    assert.ok(translations.some(item => item.id === "downloadit-ytdlp-custom-name" && item.args.name === "自定义"));
    await actor.receiveMessage({ name: "DownloadIt:DownloadVideo", data: {
      pageURL: "https://attacker.invalid/forged", presetId: "audio", args: ["--exec", "forged"],
    } });
    assert.deepEqual(calls, [["https://example.com/authoritative", "audio"]]);
  } finally {
    if (previous === undefined) delete globalThis.ChromeUtils;
    else globalThis.ChromeUtils = previous;
  }
});
