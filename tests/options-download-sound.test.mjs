import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeDownloadSoundSettings } from "../addon/chrome/content/DownloadItSound.sys.mjs";

const source = fs.readFileSync(new URL("../addon/chrome/content/options.js", import.meta.url), "utf8");
const handlers = source.slice(source.indexOf("function bindDownloadSoundSettings()"), source.indexOf("// Independent draft:"));

function fixture() {
  const nodes = new Map();
  for (const id of ["download-sound-enabled", "download-sound-path", "download-sound-volume", "download-sound-volume-value", "download-sound-lock", "browse-download-sound", "reset-download-sound", "preview-download-sound"]) {
    const listeners = new Map();
    nodes.set(id, { value: "", checked: false, disabled: false, hidden: true,
      addEventListener: (name, callback) => listeners.set(name, callback),
      fire(name, value) { return listeners.get(name)({ target: { value, checked: value } }); },
    });
  }
  const previewed = [], feedback = [], pickerCalls = [];
  const state = { busy: false, snapshot: { downloadSoundLocked: false }, draft: { downloadSound: { enabled: false, volume: 70, path: "" } }, service: { previewDownloadSound: async value => previewed.push(value) } };
  let selection = null;
  const context = vm.createContext({ document: { getElementById: id => nodes.get(id) }, state, normalizeDownloadSoundSettings, clone: structuredClone, setLocalized: (node, id, args) => { node.localized = { id, args }; }, renderActionState() {}, setFeedback: (message, kind) => feedback.push({ message, kind }), localizedError: error => error, browseLocalFile: async (id, options) => { pickerCalls.push({ id, options }); return selection; } });
  vm.runInContext(handlers, context);
  context.bindDownloadSoundSettings();
  context.renderDownloadSoundSettings();
  return { nodes, state, previewed, feedback, pickerCalls, render: () => context.renderDownloadSoundSettings(), select: value => { selection = value; } };
}

test("sound controls stage settings and preview the current unsaved draft", async () => {
  const f = fixture();
  f.nodes.get("download-sound-path").fire("input", "声音.wav");
  f.nodes.get("download-sound-volume").fire("input", "25");
  assert.equal(f.state.draft.downloadSound.path, "声音.wav");
  assert.equal(f.nodes.get("download-sound-volume-value").localized.args.volume, 0.25);
  await f.nodes.get("preview-download-sound").fire("click");
  assert.deepEqual(f.previewed, [{ enabled: false, volume: 25, path: "声音.wav" }]);
  f.nodes.get("download-sound-enabled").fire("change", true);
  assert.equal(f.state.draft.downloadSound.enabled, true);
  f.nodes.get("reset-download-sound").fire("click");
  assert.equal(f.state.draft.downloadSound.path, "");
});

test("sound file picker stages selection and cancellation preserves it", async () => {
  const f = fixture();
  f.select("sounds/complete.ogg");
  await f.nodes.get("browse-download-sound").fire("click");
  assert.equal(f.state.draft.downloadSound.path, "sounds/complete.ogg");
  assert.equal(f.pickerCalls[0].options.titleId, "downloadit-sound-browse-title");
  f.select(null);
  await f.nodes.get("browse-download-sound").fire("click");
  assert.equal(f.state.draft.downloadSound.path, "sounds/complete.ogg");
});

test("policy locks prevent sound edits while retaining preview", () => {
  const f = fixture();
  f.state.snapshot.downloadSoundLocked = true;
  f.render();
  for (const id of ["download-sound-enabled", "download-sound-path", "download-sound-volume", "browse-download-sound", "reset-download-sound"]) assert.equal(f.nodes.get(id).disabled, true);
  assert.equal(f.nodes.get("download-sound-lock").hidden, false);
  assert.equal(f.nodes.get("preview-download-sound").disabled, false);
  f.state.busy = true;
  f.render();
  assert.equal(f.nodes.get("preview-download-sound").disabled, true);
});

test("sound preview failures use localized feedback", async () => {
  const f = fixture();
  const error = { code: "download-sound-playback-failed", args: { error: "Decode error" } };
  f.state.service.previewDownloadSound = async () => { throw error; };
  await f.nodes.get("preview-download-sound").fire("click");
  assert.deepEqual(f.feedback, [{ message: error, kind: "error" }]);
});
