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

test("manifest exposes the Firefox settings dialog", () => {
  const manifest = read("addon/install.rdf");
  assert.match(manifest, /<em:optionsURL>chrome:\/\/downloadit\/content\/options\.xhtml<\/em:optionsURL>/);
  assert.match(manifest, /<em:optionsType>1<\/em:optionsType>/);
});

test("settings dialog contains the current capability controls", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  assert.doesNotMatch(markup, /chrome:\/\/global\/skin\/menulist\.css/);
  assert.match(markup, /xmlns:xul="http:\/\/www\.mozilla\.org\/keymaster\/gatekeeper\/there\.is\.only\.xul"/);
  assert.match(markup, /<xul:menulist id="default-manager"/);
  assert.match(markup, /<xul:menupopup id="default-manager-popup"/);
  assert.match(markup, /<link rel="localization" href="downloadit\.ftl"/);
  assert.match(markup, /<script[^>]+src="chrome:\/\/downloadit\/content\/options\.js"/);
  for (const id of [
    "section-managers",
    "default-manager",
    "refresh-managers",
    "auto-extension-list",
    "clear-auto-extensions",
    "section-privacy",
    "send-cookies",
    "section-about",
    "apply",
    "cancel",
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
});

test("settings refresh keeps default-manager persistence staged", () => {
  const script = read("addon/chrome/content/options.js");
  assert.match(script, /DownloadItXUL\.sys\.mjs/);
  assert.doesNotMatch(script, /XUL_NS|createElementNS/);
  assert.match(script, /createXULElement\(document, "menuitem"\)/);
  assert.match(script, /addEventListener\("command"/);
  assert.match(script, /renderedManagerKeys/);
  assert.match(script, /item\.setAttribute\("value", downloader\.key\)/);
  assert.match(script, /item\.downloadItManagerKey = downloader\.key/);
  assert.match(script, /value\.key === key/);
  assert.match(script, /select\.selectedItem = selectedItem/);
  assert.match(script, /item => item\.downloadItManagerKey === selected\?\.key/);
  assert.match(script, /refreshManagers\(\{ persistDefault: false \}\)/);
  assert.match(script, /await state\.service\.applySettings\(payload\)/);
  assert.match(script, /autoExtensions/);
  assert.match(script, /data-remove-extension/);
  assert.match(script, /downloadit-remove-extension/);
  assert.match(script, /customDownloaders/);
  assert.match(script, /reloadCustomDownloaders/);
  assert.match(script, /testAria2Configuration/);
  assert.match(
    script,
    /"inIsolatedMozBrowser" in window\.browsingContext\.originAttributes/,
  );
  assert.match(script, /\? window\.browsingContext : window/);
  assert.match(script, /picker\.init\(pickerParent, title, Ci\.nsIFilePicker\.modeOpen\)/);
});

test("settings dialog exposes custom downloader controls", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const script = read("addon/chrome/content/options.js");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const downloaders = read("addon/chrome/content/DownloadItDownloaders.sys.mjs");
  for (const id of [
    "add-custom-downloader",
    "reload-custom-downloaders",
    "retry-custom-downloaders",
    "reset-custom-downloaders",
    "custom-downloader-editor",
    "custom-command-preset",
    "custom-command-template",
    "custom-start-hidden",
    "custom-aria2-url",
    "custom-aria2-path",
    "custom-aria2-configuration",
    "browse-aria2-configuration",
    "clear-aria2-configuration",
    "test-aria2",
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
  assert.match(
    markup,
    /class="segmented-control"[^>]+data-l10n-id="downloadit-custom-type-control"/,
  );
  assert.equal((markup.match(/data-custom-type="(?:command|aria2)"/g) || []).length, 2);
  assert.doesNotMatch(
    markup,
    /class="segmented-control"[^>]+data-l10n-id="downloadit-custom-type-label"/,
  );
  assert.match(script, /startHidden: document\.getElementById\("custom-start-hidden"\)\.checked/);
  assert.match(service, /process\.startHidden = Boolean\(startHidden\)/);
  assert.match(script, /configurationPath: state\.service\.normalizeCustomFilePathForStorage/);
  assert.match(downloaders, /`--conf-path=\$\{configurationPath\}`/);
});

test("custom downloader persistence is profile-scoped and atomic", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const pack = read("pack.ps1");

  assert.match(service, /CUSTOM_DOWNLOADERS_FILE = "custom-downloaders\.json"/);
  assert.match(service, /PathUtils\.join\(PathUtils\.profileDir, PROFILE_DIRECTORY\)/);
  assert.match(service, /IOUtils\.writeUTF8\([\s\S]*\{ tmpPath: temporaryPath \}/);
  assert.match(service, /customDownloaderLoadError/);
  assert.match(service, /stringifyCustomDownloaderDocument/);
  assert.match(pack, /chrome\/content\/DownloadItDownloaders\.sys\.mjs/);
});

test("aria2 fetch prefers system-module globals before the hidden window fallback", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");

  assert.match(service, /typeof globalThis\.fetch === "function"/);
  assert.match(service, /typeof globalThis\.AbortController === "function"/);
  assert.match(
    service,
    /if \(!fetchRequest \|\| !FetchAbortController\) \{[\s\S]*?Services\.appShell\.hiddenDOMWindow/,
  );
  assert.match(service, /if \(!fetchRequest\) \{[\s\S]*?aria2-unavailable/);
  assert.match(
    service,
    /const controller = FetchAbortController \? new FetchAbortController\(\) : null/,
  );
  assert.doesNotMatch(
    service,
    /const hiddenWindow = Services\.appShell\.hiddenDOMWindow;\s*const FetchAbortController/,
  );
  assert.match(service, /throw new DownloadItError\("aria2-unavailable"\)/);
});

test("custom executable paths are portable within the Firefox configuration directory", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const script = read("addon/chrome/content/options.js");
  const markup = read("addon/chrome/content/options.xhtml");
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  assert.match(service, /Services\.dirsvc\.get\("UChrm", Ci\.nsIFile\)/);
  assert.match(service, /PathUtils\.isAbsolute\(path\)/);
  assert.match(service, /setRelativePath\(configurationDirectory,/);
  assert.match(service, /configurationDirectory\.contains\(file\)/);
  assert.match(service, /file\.getRelativePath\(configurationDirectory\)/);
  assert.match(service, /this\.resolveExecutablePath\(executablePath\)/);
  assert.match(script, /state\.service\.resolveCustomFilePath\(currentPath\)/);
  assert.match(script, /state\.service\.normalizeCustomFilePathForStorage\(picker\.file\)/);
  assert.equal((markup.match(/downloadit-executable-path-help/g) || []).length, 2);
  assert.match(englishReadme, /`UChrm`/);
  assert.match(chineseReadme, /`UChrm`/);
});

test("remembered extensions are wired through service preferences and documentation", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  for (const source of [service, englishReadme, chineseReadme]) {
    assert.match(source, /downloadit\.autoExtensions/);
  }
  assert.match(service, /autoExtensionsLocked/);
  assert.match(service, /normalizeAutoExtensions\(autoExtensions\)/);
  assert.match(service, /JSON\.stringify\(requestedAutoExtensions\)/);
});
