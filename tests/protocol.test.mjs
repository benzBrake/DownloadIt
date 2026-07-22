import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDownloadBatchJob,
  buildDownloadJob,
  isSupportedURL,
  OP_SEL,
  parseAvailableManagers,
  sanitizeFilename,
} from "../addon/chrome/content/DownloadItProtocol.sys.mjs";

test("parseAvailableManagers keeps unique available managers", () => {
  assert.deepEqual(parseAvailableManagers([
    { name: "Internet Download Manager", available: true },
    { name: "Missing", available: false, error: "not installed" },
    { name: " Internet Download Manager ", available: true },
    { name: "Free Download Manager", available: true },
  ]), ["Internet Download Manager", "Free Download Manager"]);
});

test("parseAvailableManagers rejects a non-array response", () => {
  assert.throws(() => parseAvailableManagers({}), TypeError);
});

test("supported URL filtering excludes browser-internal and local URLs", () => {
  assert.equal(isSupportedURL("https://example.com/file.zip"), true);
  assert.equal(isSupportedURL("magnet:?xt=urn:btih:test"), true);
  assert.equal(isSupportedURL("about:config"), false);
  assert.equal(isSupportedURL("file:///C:/secret.txt"), false);
  assert.equal(isSupportedURL("not a URL"), false);
});

test("buildDownloadJob emits the DownloadIt v0.60.1 JSON schema", () => {
  assert.deepEqual(buildDownloadJob({
    manager: "Internet Download Manager",
    url: "https://example.com/archive.zip",
    description: "Archive",
    cookies: "session=abc",
    filename: "archive.zip",
    referer: "https://example.com/",
    userAgent: "Firefox Test",
  }), {
    dlcount: 1,
    dmName: "Internet Download Manager",
    optype: 0,
    referer: "https://example.com/",
    dlpageReferer: "",
    dlpageCookies: "",
    useragent: "Firefox Test",
    links: [{
      url: "https://example.com/archive.zip",
      desc: "Archive",
      cookies: "session=abc",
      postdata: "",
      filename: "archive.zip",
      extension: "zip",
    }],
  });
});

test("buildDownloadJob validates required values", () => {
  assert.throws(() => buildDownloadJob({
    manager: "",
    url: "https://example.com/file.zip",
  }), /manager/i);
  assert.throws(() => buildDownloadJob({
    manager: "IDM",
    url: "javascript:alert(1)",
  }), /URL/i);
});

test("buildDownloadBatchJob emits a selection task for multiple links", () => {
  assert.deepEqual(buildDownloadBatchJob({
    manager: "Internet Download Manager",
    links: [
      {
        url: "https://example.com/one.zip",
        description: "One",
        cookies: "a=1",
      },
      {
        url: "https://example.com/two.zip",
        description: "Two",
        filename: "two<file>.zip",
        cookies: "b=2",
      },
    ],
  }), {
    dlcount: 2,
    dmName: "Internet Download Manager",
    optype: OP_SEL,
    referer: "",
    dlpageReferer: "",
    dlpageCookies: "",
    useragent: "",
    links: [
      {
        url: "https://example.com/one.zip",
        desc: "One",
        cookies: "a=1",
        postdata: "",
        filename: "",
        extension: "",
      },
      {
        url: "https://example.com/two.zip",
        desc: "Two",
        cookies: "b=2",
        postdata: "",
        filename: "two_file_.zip",
        extension: "zip",
      },
    ],
  });
});

test("sanitizeFilename removes Windows-invalid characters", () => {
  assert.equal(sanitizeFilename('bad<name>:"file?.zip'), "bad_name___file_.zip");
});
