import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeURLFilename,
  normalizeFilenameEncodings,
  getFilenameEncodingCandidates,
  getURLFilenameCandidate,
} from "../addon/chrome/content/DownloadItFilename.sys.mjs";

test("URL filename extraction ignores query and fragment data", () => {
  assert.equal(
    getURLFilenameCandidate("https://example.com/files/%D6%D0.zip?token=x#part"),
    "%D6%D0.zip",
  );
});

test("valid UTF-8 URL filenames are kept intact", () => {
  const result = getFilenameEncodingCandidates("%E4%B8%AD%E6%96%87.zip");
  assert.equal(result.encoding, "UTF-8");
  assert.equal(result.detected, "中文.zip");
  assert.deepEqual(result.candidates, []);
});

test("legacy URL filename bytes offer manual decoding candidates", () => {
  const result = getFilenameEncodingCandidates("%D6%D0%CE%C4.zip", "zh-CN");
  assert.equal(result.detected, "中文.zip");
  assert.equal(result.encoding, "GB18030");
  assert.ok(result.candidates.some(candidate => candidate.encoding === "Big5"));
  assert.ok(result.candidates.some(candidate => candidate.encoding === "Shift_JIS"));
});

test("malformed and ASCII URL names remain usable without a guessed encoding", () => {
  const malformed = getFilenameEncodingCandidates("%FF%FE.zip");
  assert.equal(malformed.encoding, "");
  assert.equal(malformed.detected, "%FF%FE.zip");
  const ascii = getFilenameEncodingCandidates("archive.zip");
  assert.equal(ascii.detected, "archive.zip");
});

test("Shift_JIS URL filenames outweigh Chinese locale hints", () => {
  const filenames = [
    ["%93%FA%96%7B%8C%EA%83%5F%83%45%83%93%83%8D%81%5B%83%68%2E%74%78%74", "日本語ダウンロード.txt"],
    ["%83%65%83%58%83%67%8E%91%97%BF%83%74%83%40%83%43%83%8B%2E%7A%69%70", "テスト資料ファイル.zip"],
  ];
  for (const locale of ["", "en-US", "ja", "zh-CN", "zh-TW"]) {
    for (const [raw, expected] of filenames) {
      const result = getFilenameEncodingCandidates(raw, locale);
      assert.equal(result.encoding, "Shift_JIS", `${locale}: ${expected}`);
      assert.equal(result.detected, expected);
      assert.ok(result.candidates.some(candidate => candidate.encoding === "GB18030"));
    }
  }
});

test("Chinese URL filename fixtures retain their legacy encoding", () => {
  const filenames = [
    ["%D6%D0%CE%C4%CF%C2%D4%D8%B2%E2%CA%D4%2E%74%78%74", "中文下载测试.txt", "GB18030", "zh-CN"],
    ["%BC%F2%CC%E5%D7%CA%C1%CF%CE%C4%BC%FE%2E%7A%69%70", "简体资料文件.zip", "GB18030", "zh-CN"],
    ["%C1%63%C5%E9%A4%A4%A4%E5%A4%55%B8%FC%2E%74%78%74", "繁體中文下載.txt", "Big5", "zh-TW"],
    ["%B4%FA%B8%D5%B8%EA%AE%C6%C0%C9%AE%D7%2E%7A%69%70", "測試資料檔案.zip", "Big5", "zh-TW"],
  ];
  for (const [raw, expected, encoding, locale] of filenames) {
    const result = getFilenameEncodingCandidates(raw, locale);
    assert.equal(result.detected, expected);
    assert.equal(result.encoding, encoding);
  }
});


test("encoding settings canonicalize aliases and reject unsupported labels", () => {
  assert.deepEqual(normalizeFilenameEncodings([" CP1251 ", "windows-1251", "koi8-r"]), ["windows-1251", "koi8-r"]);
  assert.throws(() => normalizeFilenameEncodings(["not-an-encoding"]));
  assert.throws(() => normalizeFilenameEncodings("utf-8"));
  assert.throws(() => normalizeFilenameEncodings(Array(31).fill("utf-8")));
});

test("manual decoding handles mixed escaped bytes and rejects invalid input", () => {
  assert.equal(decodeURLFilename("%83e%83X%83g.zip", "shift_jis"), "テスト.zip");
  assert.equal(decodeURLFilename("%EF%F0%E8%E2%E5%F2.txt", "windows-1251"), "привет.txt");
  assert.equal(decodeURLFilename("%93%FA", "utf-8"), "");
  assert.equal(decodeURLFilename("%00.txt", "windows-1252"), "");
});
