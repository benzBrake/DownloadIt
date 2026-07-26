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

test("links dialog exposes filtering, selection, and downloader controls", () => {
  const markup = read("addon/chrome/content/links.xhtml");
  for (const id of [
    "search",
    "type-filter",
    "extension-filter",
    "select-visible",
    "link-list",
    "clear-selection",
    "manager",
    "cancel",
    "download",
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
  assert.match(markup, /<link rel="localization" href="downloadit\.ftl"/);
  assert.match(
    markup,
    /<img class="brand-mark" src="chrome:\/\/downloadit\/content\/icons\/downloadit\.svg" alt="" aria-hidden="true" \/>/,
  );
  assert.doesNotMatch(markup, /class="brand-mark"[^>]*>DI<\/div>/);
  assert.match(markup, /data-l10n-id="downloadit-links-search"[^>]+data-l10n-attrs="placeholder,aria-label"/);
  assert.match(markup, /<button[^>]+id="type-filter"[^>]+aria-expanded="false"[^>]+aria-controls="type-filter-menu"/s);
  assert.match(markup, /<button[^>]+id="extension-filter"[^>]+aria-expanded="false"[^>]+aria-controls="extension-filter-menu"/s);
  assert.match(markup, /id="type-filter-menu"[^>]+role="group"/);
  assert.match(markup, /id="extension-filter-menu"[^>]+role="group"/);
  assert.match(markup, /id="type-filter-options"/);
  assert.match(markup, /id="extension-filter-options"/);
  assert.doesNotMatch(markup, /<select[^>]+id="(?:type|extension)-filter"/);
});

test("links dialog submits through the selected manager without persisting it", () => {
  const script = read("addon/chrome/content/links.js");

  assert.match(script, /queryPageLinks\(state\.context\.browser\)/);
  assert.match(script, /state\.service\.downloadLinks\(contexts, managerKey\)/);
  assert.doesNotMatch(script, /state\.service\.defaultManager\s*=/);
  assert.match(script, /state\.model\.setVisibleSelected\(state\.filters/);
  assert.match(script, /state\.model\.clearSelection\(\)/);
});

test("multi-select filters preserve choices and expose dismiss and keyboard behavior", () => {
  const script = read("addon/chrome/content/links.js");

  assert.match(script, /types:\s*new Set\(\)/);
  assert.match(script, /extensions:\s*new Set\(\)/);
  assert.match(script, /state\.filters\[checkbox\.dataset\.filterType\]/);
  assert.match(script, /getExtensionOptions\(state\.model\.records\)/);
  assert.match(script, /renderTypeOptions\(\)/);
  assert.match(script, /new LinkSelectionModel\(links, state\.linkGroups\)/);
  assert.match(script, /\["ArrowDown",\s*"ArrowUp",\s*"Home",\s*"End"\]/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /document\.addEventListener\("pointerdown"/);
  assert.match(script, /closeFilterMenu\(\{ restoreFocus: true \}\)/);
});

test("page-link collection does not include media source selectors", () => {
  const actor = read("addon/chrome/content/DownloadItLinkCollectorActor.sys.mjs");

  assert.match(actor, /a\[href\], area\[href\]/);
  assert.doesNotMatch(actor, /img\[src\]|video\[src\]|audio\[src\]|source\[src\]/);
});

test("both packaging scripts require the batch-link selector files", () => {
  for (const script of [read("pack.ps1"), read("pack.sh")]) {
    for (const entry of [
      "chrome/content/DownloadItLinks.sys.mjs",
      "chrome/content/links.xhtml",
      "chrome/content/links.js",
      "chrome/content/links.css",
    ]) {
      assert.match(script, new RegExp(entry.replaceAll(".", "\\.")));
    }
  }
});
