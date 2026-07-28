import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDownloadBatchJob,
  buildDownloadJob,
  classifyDownloadTarget,
  classifyDownloadTargetURL,
  DOWNLOAD_TARGET_CLASSIFICATION,
  isSupportedContextURL,
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

test("download target URLs are classified before provider dispatch", () => {
  const {
    SUPPORTED,
    BROWSER_NATIVE_ONLY,
    FIREFOX_INSTALL,
    UNSUPPORTED,
  } = DOWNLOAD_TARGET_CLASSIFICATION;
  for (const url of [
    "https://example.com/file.zip",
    "http://example.com/file.zip",
    "ftp://example.com/file.iso",
    "magnet:?xt=urn:btih:test",
  ]) {
    assert.equal(classifyDownloadTargetURL(url), SUPPORTED, url);
    assert.equal(isSupportedURL(url), true, url);
  }
  assert.equal(classifyDownloadTargetURL("blob:https://example.com/id"), BROWSER_NATIVE_ONLY);
  assert.equal(classifyDownloadTargetURL("data:text/plain,hello"), BROWSER_NATIVE_ONLY);
  for (const url of [
    "about:config",
    "chrome://browser/content/browser.xhtml",
    "resource://gre/modules/AppConstants.sys.mjs",
    "file:///C:/secret.txt",
    "mailto:user@example.com",
    "javascript:alert(1)",
    "view-source:https://example.com/",
    "not a URL",
  ]) {
    assert.equal(classifyDownloadTargetURL(url), UNSUPPORTED, url);
    assert.equal(isSupportedURL(url), false, url);
  }
  for (const url of [
    "https://example.com/addon.xpi",
    "https://example.com/ADDON.XPI?download=1#install",
    "https://example.com/addon%2Expi",
    "https://example.com/releases/xpinstall/addon.zip",
    "https://example.com/releases/get-xpinstall",
  ]) {
    assert.equal(classifyDownloadTargetURL(url), FIREFOX_INSTALL, url);
    assert.equal(isSupportedURL(url), false, url);
  }
});

test("install markers are path-specific and context URLs ignore target policy", () => {
  const { SUPPORTED, FIREFOX_INSTALL } = DOWNLOAD_TARGET_CLASSIFICATION;
  for (const url of [
    "https://xpinstall.example.com/file.zip",
    "https://example.com/file.zip?mode=xpinstall",
    "https://example.com/file.zip#xpinstall",
    "https://example.com/myxpinstaller/file.zip",
  ]) {
    assert.equal(classifyDownloadTargetURL(url), SUPPORTED, url);
  }
  assert.equal(classifyDownloadTarget({
    url: "https://example.com/download?id=1",
    filename: "addon.xpi",
  }), FIREFOX_INSTALL);
  assert.equal(classifyDownloadTarget({
    url: "https://example.com/download?id=1",
    mimeType: "application/x-xpinstall",
  }), FIREFOX_INSTALL);
  assert.equal(classifyDownloadTarget({
    url: "https://example.com/download?id=1",
    primaryExtension: ".XPI",
  }), FIREFOX_INSTALL);
  assert.equal(isSupportedContextURL("https://example.com/addon.xpi"), true);
  assert.equal(isSupportedContextURL("https://example.com/xpinstall/page"), true);
  assert.equal(isSupportedContextURL("blob:https://example.com/id"), false);
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
  assert.throws(() => buildDownloadJob({
    manager: "IDM",
    url: "https://example.com/addon%2Expi",
  }), /URL/i);
  assert.throws(() => buildDownloadJob({
    manager: "IDM",
    url: "https://example.com/download?id=1",
    filename: "addon.xpi",
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
