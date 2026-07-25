import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyLinkType,
  filterLinkRecords,
  getExtensionOptions,
  getLinkExtension,
  LinkSelectionModel,
  PAGE_LINKS_QUERY,
  queryPageLinks,
} from "../addon/chrome/content/DownloadItLinks.sys.mjs";

test("link extensions prefer download filenames and ignore URL queries", () => {
  assert.equal(getLinkExtension({
    url: "https://example.com/download?id=1",
    filename: "PHOTO.JPEG",
  }), "jpeg");
  assert.equal(getLinkExtension({
    url: "https://example.com/files/report.PDF?download=1#page=2",
  }), "pdf");
  assert.equal(getLinkExtension({
    url: "https://example.com/files/no-extension?download=1",
  }), "");
});

test("common extensions map to the supported link type filters", () => {
  const expectations = new Map([
    ["photo.webp", "image"],
    ["movie.mkv", "video"],
    ["track.flac", "audio"],
    ["manual.epub", "document"],
    ["bundle.7z", "archive"],
    ["installer.msi", "program"],
    ["download.torrent", "other"],
  ]);
  for (const [filename, type] of expectations) {
    assert.equal(classifyLinkType({ filename }), type, filename);
  }
});

test("multi-value filters use OR within groups and AND across groups", () => {
  const model = new LinkSelectionModel([
    { url: "https://example.com/photo.jpg", description: "Cover" },
    { url: "https://example.com/icon.png", description: "Icon" },
    { url: "https://example.com/movie.mp4", description: "Trailer" },
    { url: "https://example.com/audio.mp3", description: "Theme" },
    { url: "https://example.com/download", description: "Package" },
    { url: "https://example.com/rules.all", description: "Rules" },
  ]);

  assert.deepEqual(
    filterLinkRecords(model.records, {
      types: new Set(["image", "video"]),
      extensions: ["jpg", "mp4"],
      search: "e",
    }).map(record => record.url),
    [
      "https://example.com/photo.jpg",
      "https://example.com/movie.mp4",
    ],
  );
  assert.deepEqual(
    filterLinkRecords(model.records, { extensions: new Set([""]) })
      .map(record => record.url),
    ["https://example.com/download"],
  );
  assert.deepEqual(
    filterLinkRecords(model.records, { extensions: new Set(["all"]) })
      .map(record => record.url),
    ["https://example.com/rules.all"],
  );
  assert.equal(filterLinkRecords(model.records, {
    types: [],
    extensions: [],
  }).length, model.records.length);
  assert.deepEqual(
    getExtensionOptions(model.records),
    [
      { extension: "all", count: 1 },
      { extension: "jpg", count: 1 },
      { extension: "mp3", count: 1 },
      { extension: "mp4", count: 1 },
      { extension: "png", count: 1 },
      { extension: "", count: 1 },
    ],
  );
});

test("selection starts empty and visible operations preserve hidden choices", () => {
  const model = new LinkSelectionModel([
    { url: "https://example.com/one.jpg", description: "One" },
    { url: "https://example.com/two.png", description: "Two" },
    { url: "https://example.com/three.mp4", description: "Three" },
  ]);

  assert.equal(model.selectedCount, 0);
  model.setSelected("https://example.com/three.mp4", true);
  model.setVisibleSelected({ types: new Set(["image"]) }, true);
  assert.equal(model.selectedCount, 3);
  assert.deepEqual(model.selectionState(model.visible({ types: ["image"] })), {
    checked: true,
    indeterminate: false,
    disabled: false,
    selectedCount: 2,
  });
  model.setVisibleSelected({ extensions: new Set(["png"]) }, false);
  assert.deepEqual(
    model.selectedLinks().map(link => link.url),
    [
      "https://example.com/one.jpg",
      "https://example.com/three.mp4",
    ],
  );
  model.clearSelection();
  assert.equal(model.selectedCount, 0);
});

function browsingContext(response, children = []) {
  return {
    children,
    currentWindowGlobal: {
      getActor(name) {
        assert.equal(name, "DownloadItSelection");
        return {
          async sendQuery(query) {
            assert.equal(query, PAGE_LINKS_QUERY);
            return response;
          },
        };
      },
    },
  };
}

test("page-link queries merge frames, filter protocols, and enrich duplicates", async () => {
  const child = browsingContext([
    {
      url: "https://example.com/shared.zip",
      description: "Shared archive",
      filename: "shared.zip",
    },
    { url: "ftp://example.com/file.iso", description: "FTP" },
  ]);
  const root = browsingContext([
    {
      url: "https://example.com/shared.zip",
      description: "https://example.com/shared.zip",
      filename: "",
    },
    { url: "javascript:void(0)", description: "Unsupported" },
  ], [child]);

  assert.deepEqual(await queryPageLinks({ browsingContext: root }), [
    {
      url: "https://example.com/shared.zip",
      description: "Shared archive",
      filename: "shared.zip",
    },
    {
      url: "ftp://example.com/file.iso",
      description: "FTP",
      filename: "",
    },
  ]);
});
