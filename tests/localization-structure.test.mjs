import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(
  path.join(projectRoot, relativePath),
  "utf8",
);

function messageIds(source) {
  return new Set(
    [...source.matchAll(/^([a-z][a-z0-9-]*)\s*=/gm)].map(match => match[1]),
  );
}

test("supported Fluent resources contain the same message IDs", () => {
  const english = messageIds(read("addon/chrome/content/locales/en-US/downloadit.ftl"));
  const chinese = messageIds(read("addon/chrome/content/locales/zh-CN/downloadit.ftl"));

  assert.deepEqual([...chinese].sort(), [...english].sort());
  assert.ok(english.size > 0);
});

test("remembered-extension removal uses an accessible Fluent label", () => {
  for (const locale of ["en-US", "zh-CN"]) {
    const source = read(`addon/chrome/content/locales/${locale}/downloadit.ftl`);
    assert.match(
      source,
      /downloadit-remove-extension\s*=\s*\r?\n\s+\.aria-label\s*=/,
    );
  }
});

test("custom XUL menu labels use the Fluent label attribute", () => {
  for (const locale of ["en-US", "zh-CN"]) {
    const source = read(`addon/chrome/content/locales/${locale}/downloadit.ftl`);
    assert.match(
      source,
      /downloadit-custom-downloader-menu-label\s*=\s*\r?\n\s+\.label\s*=/,
    );
  }
});

test("runtime text uses Fluent resources instead of inline localization maps", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const optionsScript = read("addon/chrome/content/options.js");
  const contextScript = read("addon/chrome/content/DownloadItContextMenu.sys.mjs");
  const panelScript = read("addon/chrome/content/DownloadItPanelView.sys.mjs");
  const dialogScript = read("addon/chrome/content/DownloadItDownloadDialog.sys.mjs");
  const serviceScript = read("addon/chrome/content/DownloadItService.sys.mjs");
  const ids = messageIds(read("addon/chrome/content/locales/en-US/downloadit.ftl"));
  const nonMessageIds = new Set([
    "downloadit-context-menu",
    "downloadit-context-popup",
    "downloadit-download-default",
    "downloadit-download-manager",
    "downloadit-download-option",
    "downloadit-download-radio",
    "downloadit-download-deck",
    "downloadit-download-manager-popup",
    "downloadit-download-action",
  ]);
  const references = new Set([
    ...[...markup.matchAll(/data-l10n-id="([^"]+)"/g)].map(match => match[1]),
    ...[...optionsScript.matchAll(/"(downloadit-[a-z0-9-]+)"/g)].map(match => match[1]),
    ...[...contextScript.matchAll(/"(downloadit-[a-z0-9-]+)"/g)].map(match => match[1]),
    ...[...dialogScript.matchAll(/"(downloadit-[a-z0-9-]+)"/g)].map(match => match[1]),
    ...[...panelScript.matchAll(/this\.setLocalized\([^,]+,\s*"(downloadit-[a-z0-9-]+)"/g)]
      .map(match => match[1]),
    ...[...panelScript.matchAll(/this\.setStatus\("(downloadit-[a-z0-9-]+)"/g)]
      .map(match => match[1]),
    ...[...serviceScript.matchAll(/l10nId:\s*"(downloadit-[a-z0-9-]+)"/g)]
      .map(match => match[1]),
  ]);

  assert.doesNotMatch(markup, /data-i18n/);
  assert.doesNotMatch(optionsScript, /const TEXT\s*=|%s/);
  assert.doesNotMatch(serviceScript, /const MESSAGES\s*=|\.message\(/);
  for (const id of references) {
    if (nonMessageIds.has(id)) {
      continue;
    }
    assert.ok(ids.has(id), `missing Fluent message: ${id}`);
  }
});

test("native Fluent source uses a directory pre-path for link resource IDs", () => {
  const localization = read("addon/chrome/content/DownloadItLocalization.sys.mjs");

  assert.match(
    localization,
    /chrome:\/\/downloadit\/content\/locales\/\{locale\}\//,
  );
  assert.match(localization, /addResourceIds\(\[RESOURCE\]\)/);
  assert.match(localization, /formatValue\("downloadit-download"\)/);
});
