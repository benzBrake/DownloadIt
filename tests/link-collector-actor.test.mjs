import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import {
  collectPageLinks,
  collectSelectionLinks,
  getPlayableVideoURL,
  isKnownYtDlpPage,
} from "../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs";

function link({
  href,
  text = "",
  download = "",
  ariaLabel = "",
} = {}) {
  return {
    href,
    textContent: text,
    getAttribute(name) {
      return {
        download,
        "aria-label": ariaLabel,
      }[name] || null;
    },
  };
}

test("link collector Actor scans document links and open shadow roots", () => {
  const pageLink = link({
    href: "https://example.com/page.zip",
    text: " Page ",
    download: "page.zip",
  });
  const areaLink = link({
    href: "https://example.com/map.pdf",
    ariaLabel: "Map document",
  });
  const shadowLink = link({
    href: "https://example.com/shadow.mp4",
    text: "Shadow video",
  });
  const shadowRoot = {
    querySelectorAll(selector) {
      return selector === "a[href], area[href]" ? [shadowLink] : [];
    },
  };
  const host = { shadowRoot };
  const document = {
    querySelectorAll(selector) {
      return selector === "a[href], area[href]"
        ? [pageLink, areaLink]
        : [host];
    },
  };

  assert.deepEqual(collectPageLinks(document), [
    {
      url: "https://example.com/page.zip",
      description: "Page",
      filename: "page.zip",
    },
    {
      url: "https://example.com/map.pdf",
      description: "Map document",
      filename: "",
    },
    {
      url: "https://example.com/shadow.mp4",
      description: "Shadow video",
      filename: "",
    },
  ]);
});

test("link collector Actor returns links intersecting the current selection", () => {
  const first = {
    href: "https://example.com/one.zip",
    textContent: " One ",
    getAttribute(name) {
      return name === "download" ? "one.zip" : null;
    },
  };
  const second = {
    href: "https://example.com/two.zip",
    textContent: "Two",
    getAttribute() {
      return null;
    },
  };
  const outside = {
    href: "https://example.com/outside.zip",
    textContent: "Outside",
    getAttribute() {
      return null;
    },
  };
  const selected = new Set([first, second]);
  const document = {
    defaultView: {
      getSelection() {
        return {
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt() {
            return {
              intersectsNode(node) {
                return selected.has(node);
              },
            };
          },
        };
      },
    },
    querySelectorAll() {
      return [first, second, outside];
    },
  };

  assert.deepEqual(collectSelectionLinks(document), [
    {
      url: "https://example.com/one.zip",
      description: "One",
      filename: "one.zip",
    },
    {
      url: "https://example.com/two.zip",
      description: "Two",
      filename: "",
    },
  ]);
});

test("link collector Actor returns no links for a collapsed selection", () => {
  const document = {
    defaultView: {
      getSelection() {
        return { rangeCount: 0, isCollapsed: true };
      },
    },
    querySelectorAll() {
      throw new Error("collapsed selections must not scan the document");
    },
  };

  assert.deepEqual(collectSelectionLinks(document), []);
});

test("video URL selection prefers the active media URL and excludes browser-local streams", () => {
  const document = { baseURI: "https://example.com/watch/" };
  assert.equal(getPlayableVideoURL({ ownerDocument: document }), "");
  assert.equal(getPlayableVideoURL({
    currentSrc: "https://cdn.example.com/active.mp4?token=1",
    src: "https://cdn.example.com/fallback.mp4",
    ownerDocument: document,
  }), "https://cdn.example.com/active.mp4?token=1");
  assert.equal(getPlayableVideoURL({
    currentSrc: "",
    src: "../video.mp4",
    ownerDocument: document,
  }), "https://example.com/video.mp4");
  assert.equal(getPlayableVideoURL({
    currentSrc: "blob:https://example.com/1234",
    src: "https://cdn.example.com/fallback.mp4",
    ownerDocument: document,
  }), "");
});

test("known YouTube pages skip the yt-dlp support process", () => {
  assert.equal(isKnownYtDlpPage("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(isKnownYtDlpPage("https://youtu.be/abc"), true);
  assert.equal(isKnownYtDlpPage("https://music.youtube.com/watch?v=abc"), true);
  assert.equal(isKnownYtDlpPage("https://youtube.com.attacker.invalid/watch"), false);
});

test("yt-dlp support probing starts when the page actor initializes", async () => {
  const { DownloadItLinkCollectorChild } = await import(
    "../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs"
  );
  const queries = [];
  const actor = new DownloadItLinkCollectorChild();
  actor.document = {
    documentElement: {},
    location: { href: "https://unsupported.invalid/watch/1" },
  };
  actor.sendQuery = async name => {
    queries.push(name);
    return name === "DownloadIt:GetYtDlpEnabled";
  };
  actor.probeCurrentPage = () => queries.push("probe-page");
  actor.actorCreated();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(queries.includes("probe-page"));
});

test("video download overlay is attached and removed with its frame actor", async () => {
  const actor = await import("../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs");
  assert.match(actor.DownloadItLinkCollectorChild.prototype.actorCreated.toString(), /setVideoButtonEnabled/);
  assert.match(actor.DownloadItLinkCollectorChild.prototype.setVideoButtonEnabled.toString(), /installVideoButton/);
  assert.match(actor.DownloadItLinkCollectorChild.prototype.didDestroy.toString(), /cleanupVideoButton/);
  assert.match(actor.DownloadItLinkCollectorParent.prototype.receiveMessage.toString(), /service\.downloadViaYtDlp/);
  assert.match(actor.DownloadItLinkCollectorParent.prototype.receiveMessage.toString(), /probeYtDlpPage/);
});

test("video overlay actor starts for already-open pages and future documents", () => {
  const service = readFileSync(
    new URL("../addon/chrome/content/DownloadItService.sys.mjs", import.meta.url),
    "utf8",
  );
  assert.match(service, /DOMContentLoaded:\s*\{\s*capture:\s*true\s*\}/);
  assert.match(service, /registerLinkCollectorActor\(\);\s*initializeLinkCollectorActors\(\);/);
  const messages = [];
  const context = id => ({
    currentWindowGlobal: {
      getActor(name) {
        assert.equal(name, "DownloadItLinkCollector");
        return {
          sendAsyncMessage(name, data) {
            messages.push({ id, name, enabled: data.enabled });
          },
        };
      },
    },
    children: [],
  });
  const top = context("top");
  top.children.push(context("frame"));
  const window = { gBrowser: { browsers: [{ browsingContext: top }] } };
  const sandbox = vm.createContext({
    Services: {
      prefs: { getBoolPref: () => false },
      wm: {
        getEnumerator() {
          let pending = true;
          return {
            hasMoreElements: () => pending,
            getNext() { pending = false; return window; },
          };
        },
      },
    },
    LINK_COLLECTOR_ACTOR_NAME: "DownloadItLinkCollector",
    VIDEO_BUTTON_SETTING_MESSAGE: "DownloadIt:SetVideoButtonEnabled",
    PREF_VIDEO_DOWNLOAD_BUTTON: "downloadit.videoDownloadButton",
  });
  vm.runInContext(service.slice(
    service.indexOf("function initializeLinkCollectorActors()"),
    service.indexOf("export class DownloadItError"),
  ), sandbox);
  sandbox.initializeLinkCollectorActors();
  assert.deepEqual(messages, ["top", "frame"].map(id => ({
    id, name: "DownloadIt:SetVideoButtonEnabled", enabled: false,
  })));
});

test("video overlay submits the page URL to yt-dlp", async () => {
  const { DownloadItLinkCollectorParent } = await import(
    "../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs"
  );
  const submissions = [];
  const window = { document: { l10n: { async formatValue(id) {
    assert.equal(id, "downloadit-ytdlp-download");
    return "下载";
  } } } };
  const browser = { ownerDocument: { defaultView: window }, currentURI: { spec: "file:///video-test.html" } };
  const actor = new DownloadItLinkCollectorParent();
  actor.browsingContext = {
    id: 42,
    top: { embedderElement: browser },
    currentWindowGlobal: { documentURI: { spec: "https://example.com/watch/123" } },
  };
  const originalChromeUtils = globalThis.ChromeUtils;
  globalThis.ChromeUtils = { importESModule(spec) {
    if (spec.endsWith("DownloadItLocalization.sys.mjs")) {
      return { async initializeDownloadItLocalization(target) {
        assert.equal(target, window);
      } };
    }
    if (spec.endsWith("DownloadItService.sys.mjs")) {
      return { getActiveService: () => ({
        ytDlpEnabled: true,
        async downloadViaYtDlp(pageURL) { submissions.push(pageURL); },
      }) };
    }
    throw new Error(`Unexpected import: ${spec}`);
  } };
  try {
    assert.equal(await actor.receiveMessage({ name: "DownloadIt:GetVideoButtonLabel" }), "下载");
    await actor.receiveMessage({ name: "DownloadIt:DownloadVideo", data: { pageURL: "https://example.com/watch/123" } });
  } finally {
    if (originalChromeUtils === undefined) delete globalThis.ChromeUtils;
    else globalThis.ChromeUtils = originalChromeUtils;
  }
  assert.deepEqual(submissions, ["https://example.com/watch/123"]);
});

test("deferred video overlay initialization uses its document's observer constructor", async () => {
  const { DownloadItLinkCollectorChild } = await import(
    "../addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs"
  );
  const observed = [];
  const root = {};
  const actor = new DownloadItLinkCollectorChild();
  actor.document = {
    documentElement: root,
    addEventListener() {},
    defaultView: {
      addEventListener() {},
      MutationObserver: class {
        constructor(callback) { this.callback = callback; }
        observe(target, options) { observed.push({ target, options }); }
      },
    },
  };
  actor.ensureVideoButton = () => {};
  actor.sendQuery = async () => "下载";
  actor.setVideoButtonEnabled(true);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].target, root);
  assert.deepEqual(observed[0].options, { childList: true, subtree: true });
  assert.ok(actor.observer);
});
