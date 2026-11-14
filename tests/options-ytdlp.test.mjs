import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { defaultYtDlpPresets } from "../addon/chrome/content/DownloadItYtDlp.sys.mjs";

const source = readFileSync(new URL("../addon/chrome/content/options.js", import.meta.url), "utf8");
const handlers = source.slice(source.indexOf("function bindYtDlpPresets()"), source.indexOf("function isBuiltInDownloader("));

function fixture() {
  const nodes = new Map();
  let focused = null;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.isConnected = true; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    click() { if (!this.disabled) this.listeners.click?.(); }
    focus() { focused = this; }
  }
  const get = id => {
    if (!nodes.has(id)) { const node = new Element(); node.id = id; }
    return nodes.get(id);
  };
  const state = { draft: { ytDlpPresets: defaultYtDlpPresets() }, snapshot: {}, busy: false };
  const initial = structuredClone(state.draft);
  let dirty = false;
  let nextUUID = 0;
  const context = vm.createContext({
    state, Services: { uuid: { generateUUID: () => `{00000000-0000-4000-8000-${String(++nextUUID).padStart(12, "0")}}` } },
    document: { createElement: tag => new Element(tag), getElementById: get,
      l10n: { formatValue: async id => id } },
    defaultYtDlpPresets, clearFeedback() {}, console,
    setLocalized: (node, id) => { node.l10nId = id; },
    renderActionState: () => { dirty = JSON.stringify(initial) !== JSON.stringify(state.draft); },
    render: () => { context.renderYtDlpPresets(); context.renderActionState(); },
  });
  vm.runInContext(handlers, context);
  context.bindYtDlpPresets();
  context.renderYtDlpPresets();
  const row = index => get("ytdlp-preset-list").children[index].children[0];
  const actions = index => row(index).children.at(-1).children;
  return { state, get, row, actions, render: () => context.renderYtDlpPresets(),
    dirty: () => dirty, focused: () => focused };
}

test("yt-dlp editor stages names, options, and enabled state without replacing the active input", () => {
  const f = fixture();
  assert.equal(f.get("ytdlp-preset-list").children.length, 4);
  const input = f.get("ytdlp-name-video");
  assert.equal(input.type, "text");
  input.value = "高清视频";
  input.listeners.input();
  const args = f.get("ytdlp-args-video");
  args.value = '--no-playlist -f "best[height<=1080]"';
  args.listeners.input();
  const enabled = f.row(1).children[1].children[0];
  enabled.checked = false;
  enabled.listeners.change();
  assert.equal(f.state.draft.ytDlpPresets[0].name, "高清视频");
  assert.equal(f.state.draft.ytDlpPresets[0].args, args.value);
  assert.equal(f.state.draft.ytDlpPresets[1].enabled, false);
  assert.equal(f.get("ytdlp-name-video"), input);
  assert.equal(f.dirty(), true);
});

test("yt-dlp editor adds, reorders, removes, resets, and restores useful keyboard focus", () => {
  const f = fixture();
  f.get("add-ytdlp-preset").click();
  const custom = f.state.draft.ytDlpPresets[4];
  assert.match(custom.id, /^custom-/);
  assert.equal(f.focused(), f.get(`ytdlp-name-${custom.id}`));
  f.actions(4)[0].click();
  assert.equal(f.state.draft.ytDlpPresets[3].id, custom.id);
  assert.equal(f.focused(), f.get(`ytdlp-name-${custom.id}`));
  f.actions(3)[1].click();
  assert.equal(f.state.draft.ytDlpPresets[4].id, custom.id);
  f.actions(4)[2].click();
  assert.equal(f.state.draft.ytDlpPresets.length, 4);
  f.get("reset-ytdlp-presets").click();
  assert.deepEqual(f.state.draft.ytDlpPresets, defaultYtDlpPresets());
});

test("policy and busy states lock the entire preset editor; the final item cannot be removed", () => {
  const f = fixture();
  for (const flag of ["policy", "busy"]) {
    f.state.snapshot.ytDlpPresetsLocked = flag === "policy";
    f.state.busy = flag === "busy";
    f.render();
    assert.equal(f.get("add-ytdlp-preset").disabled, true);
    assert.equal(f.get("reset-ytdlp-presets").disabled, true);
    assert.equal(f.row(0).disabled, true);
    f.get("add-ytdlp-preset").click();
    assert.equal(f.state.draft.ytDlpPresets.length, 4);
  }
  f.state.busy = false;
  f.state.draft.ytDlpPresets = [f.state.draft.ytDlpPresets[0]];
  f.render();
  assert.equal(f.actions(0)[2].disabled, true);
});
