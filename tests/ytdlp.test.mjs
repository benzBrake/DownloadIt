import test from "node:test";
import assert from "node:assert/strict";
import {
  buildYtDlpArguments, defaultYtDlpPresets, readYtDlpPresets,
  validateYtDlpPresets, YtDlpPresetError,
} from "../addon/chrome/content/DownloadItYtDlp.sys.mjs";

const url = "https://example.com/watch?v=123&list=456";
const directory = "C:\\My Downloads\\视频";

test("yt-dlp presets independently select video, MP3, subtitles, and playlists", () => {
  const presets = defaultYtDlpPresets();
  const args = id => buildYtDlpArguments(url, directory, presets, id);
  assert.deepEqual(args("video"), ["--ignore-config", "--paths", directory, "--no-playlist", "--", url]);
  assert.deepEqual(args("audio").slice(3, -2), ["--no-playlist", "-x", "--audio-format", "mp3"]);
  assert.deepEqual(args("subtitles").slice(3, -2), ["--no-playlist", "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "all,-live_chat"]);
  assert.deepEqual(args("playlist").slice(3, -2), ["--yes-playlist"]);
  assert.equal(args("playlist").includes("--no-playlist"), false);
});

test("first enabled preset is default; disabled/deleted IDs and non-web URLs cannot launch", () => {
  const presets = defaultYtDlpPresets();
  presets[0].enabled = false;
  assert.ok(buildYtDlpArguments(url, directory, presets).includes("-x"));
  presets.unshift(presets.pop());
  assert.ok(buildYtDlpArguments(url, directory, presets).includes("--yes-playlist"));
  for (const id of ["video", "unknown", {}, "--exec"]) {
    assert.throws(() => buildYtDlpArguments(url, directory, presets, id), YtDlpPresetError);
  }
  for (const value of ["file:///tmp/video", "javascript:alert(1)", "ftp://example.com/a"]) {
    assert.throws(() => buildYtDlpArguments(value, directory, presets), YtDlpPresetError);
  }
});

test("custom options preserve quote boundaries, Unicode, output templates, and shell metacharacters", () => {
  const presets = [{ id: "custom-1", name: "  自定义音频  ", enabled: true,
    args: '--format "bestaudio/best" --paths "D:\\Music Files" -o "%(title)s.%(ext)s" --postprocessor-args \'a b\' --match-title "测试 & $(literal)"' }];
  assert.deepEqual(buildYtDlpArguments(url, directory, presets), [
    "--ignore-config", "--paths", directory, "--format", "bestaudio/best",
    "--paths", "D:\\Music Files", "-o", "%(title)s.%(ext)s", "--postprocessor-args", "a b",
    "--match-title", "测试 & $(literal)", "--", url,
  ]);
  assert.equal(validateYtDlpPresets(presets)[0].name, "自定义音频");
});

test("invalid preset settings are rejected atomically and corrupt storage falls back", () => {
  for (const value of [null, {}, [], Array(51).fill(defaultYtDlpPresets()[0]),
    [{ id: "custom", name: "", args: "", enabled: true }],
    defaultYtDlpPresets().map(item => ({ ...item, enabled: false })),
    [{ ...defaultYtDlpPresets()[0], args: '--format "unclosed' }],
    [{ ...defaultYtDlpPresets()[0], args: "a\0b" }],
    [{ ...defaultYtDlpPresets()[0], name: "x".repeat(121) }],
    [{ ...defaultYtDlpPresets()[0], name: "a\nb" }],
    [{ ...defaultYtDlpPresets()[0], args: "x".repeat(8193) }],
    [{ ...defaultYtDlpPresets()[0], enabled: "false" }],
  ]) assert.throws(() => validateYtDlpPresets(value), YtDlpPresetError);
  for (const raw of ["", "not json", "[]", "{}", "null"]) {
    assert.deepEqual(readYtDlpPresets(raw), defaultYtDlpPresets());
  }
  const presets = defaultYtDlpPresets().reverse();
  assert.deepEqual(readYtDlpPresets(JSON.stringify(presets)), presets);
  const fresh = defaultYtDlpPresets();
  fresh[0].args = "changed";
  assert.equal(defaultYtDlpPresets()[0].args, "--no-playlist");
});
