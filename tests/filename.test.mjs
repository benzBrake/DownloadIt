import test from "node:test";
import assert from "node:assert/strict";

import {
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
