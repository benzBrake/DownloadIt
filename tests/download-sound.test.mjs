import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BUILTIN_DOWNLOAD_SOUND,
  DownloadItSoundIntegration,
  normalizeDownloadSoundSettings,
  validateDownloadSoundSettings,
} from "../addon/chrome/content/DownloadItSound.sys.mjs";

function fixture({ existing = [], getList, addView, play } = {}) {
  const views = new Set();
  const audios = [];
  const errors = [];
  let settings = { enabled: true, volume: 70, path: "" };
  const list = {
    async addView(view) {
      views.add(view);
      existing.forEach(download => view.onDownloadAdded(download));
      await addView?.();
    },
    async removeView(view) { views.delete(view); },
  };
  const integration = new DownloadItSoundIntegration({
    downloads: { ALL: "all", async getList(kind) {
      assert.equal(kind, "all");
      if (getList) await getList();
      return list;
    } },
    readSettings: () => settings,
    resolveURL: path => `file:///${path}`,
    createAudio: url => {
      const listeners = new Map();
      const ownerListeners = new Map();
      const audio = {
        url, paused: false, unloaded: false,
        ownerDocument: { defaultView: {
          addEventListener: (name, callback) => ownerListeners.set(name, callback),
          removeEventListener: name => ownerListeners.delete(name),
        } },
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: name => listeners.delete(name),
        pause() { this.paused = true; },
        removeAttribute(name) { assert.equal(name, "src"); this.unloaded = true; },
        load() {},
        play: async () => play?.(),
        fire: name => listeners.get(name)?.(),
        closeOwner: () => ownerListeners.get("unload")?.(),
        listeners, ownerListeners,
      };
      audios.push(audio);
      return audio;
    },
    reportError: error => errors.push(error),
  });
  return { integration, list, views, audios, errors,
    settings: value => { settings = value; },
    add(download = { stopped: false, succeeded: false }) {
      for (const view of views) view.onDownloadAdded(download);
      return download;
    },
    change(download, state) {
      Object.assign(download, state);
      for (const view of views) view.onDownloadChanged(download);
    },
  };
}

const success = { succeeded: true, stopped: true, error: null, canceled: false };

test("sound settings default to disabled with a portable built-in source", () => {
  assert.deepEqual(normalizeDownloadSoundSettings(), { enabled: false, volume: 70, path: "" });
  assert.deepEqual(normalizeDownloadSoundSettings(null), { enabled: false, volume: 70, path: "" });
  assert.deepEqual(normalizeDownloadSoundSettings({ enabled: 1, volume: NaN, path: 3 }),
    { enabled: false, volume: 70, path: "" });
  assert.equal(validateDownloadSoundSettings({ enabled: true, volume: 0, path: " a.wav " }).path, "a.wav");
  for (const bad of [null, {}, { enabled: true, volume: 101, path: "" },
    { enabled: true, volume: -1, path: "" }, { enabled: true, volume: 1.5, path: "" },
    { enabled: "yes", volume: 50, path: "" }, { enabled: false, volume: 50, path: "a\0.wav" }]) {
    assert.throws(() => validateDownloadSoundSettings(bad), { code: "download-sound-settings-invalid" });
  }
});

test("historical successes and newly added completed records remain silent", async () => {
  const old = { ...success };
  const f = fixture({ existing: [old] });
  await f.integration.start();
  f.change(old, success);
  const imported = f.add({ ...success });
  f.change(imported, success);
  assert.equal(f.audios.length, 0);
  await f.integration.stop();
});

test("one view announces each successful task once using the built-in PCM chime", async () => {
  const f = fixture();
  await Promise.all([f.integration.start(), f.integration.start()]);
  assert.equal(f.views.size, 1);
  const download = f.add();
  f.change(download, { succeeded: true, stopped: false });
  assert.equal(f.audios.length, 0);
  f.change(download, success);
  assert.equal(f.audios.length, 1);
  assert.equal(f.audios[0].url, BUILTIN_DOWNLOAD_SOUND);
  assert.equal(f.audios[0].volume, 0.7);
  f.audios[0].fire("ended");
  f.change(download, success);
  assert.equal(f.audios.length, 1);
  await f.integration.stop();
  assert.equal(f.views.size, 0);
});

test("failed, canceled and paused tasks remain silent; retry success rings", async () => {
  const f = fixture();
  await f.integration.start();
  const download = f.add();
  f.change(download, { stopped: true, canceled: true });
  f.change(download, { canceled: false, error: new Error("network") });
  f.change(download, { error: null, stopped: false });
  assert.equal(f.audios.length, 0);
  f.change(download, success);
  assert.equal(f.audios.length, 1);
  await f.integration.stop();
});

test("settings are read at completion and enabling does not replay muted successes", async () => {
  const f = fixture();
  await f.integration.start();
  f.settings({ enabled: false, volume: 30, path: "" });
  const muted = f.add();
  f.change(muted, success);
  f.settings({ enabled: true, volume: 25, path: "铃声.wav" });
  f.change(muted, success);
  assert.equal(f.audios.length, 0);
  f.change(f.add(), success);
  assert.equal(f.audios[0].url, "file:///铃声.wav");
  assert.equal(f.audios[0].volume, 0.25);
  await f.integration.stop();
});

test("simultaneous completions share a sound; subsequent tasks can ring", async () => {
  const f = fixture();
  await f.integration.start();
  const a = f.add(), b = f.add(), c = f.add();
  f.change(a, success);
  f.change(b, success);
  assert.equal(f.audios.length, 1);
  f.audios[0].fire("ended");
  f.change(b, success);
  assert.equal(f.audios.length, 1);
  f.change(c, success);
  assert.equal(f.audios.length, 2);
  await f.integration.stop();
});

test("preview replaces prior audio and works with disabled draft settings", async () => {
  const f = fixture();
  const value = { enabled: false, volume: 100, path: "custom.ogg" };
  await f.integration.play(value);
  await f.integration.play(value);
  assert.equal(f.audios[0].paused, true);
  assert.equal(f.audios[0].unloaded, true);
  assert.equal(f.audios[0].listeners.size, 0);
  assert.equal(f.audios[0].ownerListeners.size, 0);
  assert.equal(f.audios[1].volume, 1);
  f.audios[1].closeOwner();
  assert.equal(f.integration.playback, null);
  assert.equal(f.audios[1].unloaded, true);
});

test("media errors release audio; rejected playback reports localized error data", async () => {
  const f = fixture({ play: async () => { throw new Error("Unsupported media"); } });
  await assert.rejects(f.integration.play({ enabled: true, volume: 70, path: "bad.wav" }),
    { code: "download-sound-playback-failed", args: { error: "Unsupported media" } });
  assert.equal(f.integration.playback, null);
  assert.equal(f.audios[0].unloaded, true);
  await f.integration.start();
  f.change(f.add(), success);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.errors.length, 1);
  await f.integration.stop();
  const g = fixture();
  await g.integration.play({ enabled: false, volume: 70, path: "" });
  g.audios[0].fire("error");
  assert.equal(g.integration.playback, null);
  assert.equal(g.audios[0].ownerListeners.size, 0);
});

test("shutdown before list readiness does not attach a late view", async () => {
  let release;
  const f = fixture({ getList: () => new Promise(resolve => { release = resolve; }) });
  const ready = f.integration.start();
  const stopped = f.integration.stop();
  release();
  await Promise.all([ready, stopped]);
  assert.equal(f.views.size, 0);
});

test("shutdown during addView removes the view and blocks late callbacks", async () => {
  let release;
  const f = fixture({ addView: () => new Promise(resolve => { release = resolve; }) });
  const ready = f.integration.start();
  await new Promise(resolve => setImmediate(resolve));
  const view = [...f.views][0];
  const download = f.add();
  f.change(download, success);
  const stopped = f.integration.stop();
  assert.equal(f.audios[0].paused, true);
  const late = {};
  view.onDownloadAdded(late);
  Object.assign(late, success);
  view.onDownloadChanged(late);
  release();
  await Promise.all([ready, stopped]);
  assert.equal(f.views.size, 0);
  assert.equal(f.audios.length, 1);
});

test("restarting discards the old view and safely baselines completed history", async () => {
  const old = { stopped: false, succeeded: false };
  const f = fixture({ existing: [old] });
  await f.integration.start();
  const view = [...f.views][0];
  f.change(old, success);
  await f.integration.stop();
  await f.integration.start();
  view.onDownloadChanged(old);
  f.change(old, success);
  assert.equal(f.audios.length, 1);
  f.change(f.add(), success);
  assert.equal(f.audios.length, 2);
  await f.integration.stop();
});

test("bundled chime is short uncompressed mono PCM with non-silent samples", () => {
  const wav = fs.readFileSync(new URL("../addon/chrome/content/sounds/download-complete.wav", import.meta.url));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  const duration = (wav.length - 44) / wav.readUInt32LE(28);
  assert.ok(duration > 0.5 && duration < 1);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert.ok(peak > 1000 && peak < 32767);
  for (const script of ["pack.ps1", "pack.sh"]) {
    const source = fs.readFileSync(new URL(`../scripts/${script}`, import.meta.url), "utf8");
    assert.ok(source.includes("chrome/content/sounds/download-complete.wav"));
    assert.ok(source.includes("chrome/content/DownloadItSound.sys.mjs"));
  }
});
