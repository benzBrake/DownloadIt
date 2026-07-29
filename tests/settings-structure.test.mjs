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
  assert.match(manifest, /<em:iconURL>chrome:\/\/downloadit\/content\/icons\/downloadit\.svg<\/em:iconURL>/);
  assert.match(manifest, /<em:optionsURL>chrome:\/\/downloadit\/content\/options\.xhtml<\/em:optionsURL>/);
  assert.match(manifest, /<em:optionsType>1<\/em:optionsType>/);
  assert.match(manifest, /<em:optionsResizable>true<\/em:optionsResizable>/);
  assert.match(manifest, /<em:optionsWidth>1080<\/em:optionsWidth>/);
  assert.match(manifest, /<em:optionsHeight>720<\/em:optionsHeight>/);
});

test("DownloadIt icon is packaged and used by branded Firefox UI", () => {
  const icon = read("addon/chrome/content/icons/downloadit.svg");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const panel = read("addon/chrome/content/DownloadItPanelView.sys.mjs");
  const contextMenu = read("addon/chrome/content/DownloadItContextMenu.sys.mjs");
  const downloadDialog = read("addon/chrome/content/DownloadItDownloadDialog.sys.mjs");
  const packPowerShell = read("pack.ps1");
  const packShell = read("pack.sh");
  const iconUrl = "chrome://downloadit/content/icons/downloadit.svg";

  assert.match(icon, /<svg[^>]+viewBox="0 0 16 16"/);
  for (const source of [service, panel, contextMenu, downloadDialog]) {
    assert.match(source, new RegExp(iconUrl.replaceAll(".", "\\.")));
  }
  for (const source of [packPowerShell, packShell]) {
    assert.match(source, /chrome\/content\/icons\/downloadit\.svg/);
  }
});

test("packaging scripts select the authenticated API or nightly.link", () => {
  const packPowerShell = read("pack.ps1");
  const packShell = read("pack.sh");
  const nightlyLink = "https://nightly.link/benzBrake/Grabby-FlashGot/workflows/nightly.yml/master/FlashGot-nightly.zip";

  for (const source of [packPowerShell, packShell]) {
    assert.match(source, new RegExp(nightlyLink.replaceAll(".", "\\.")));
    assert.match(source, /GITHUB_TOKEN/);
    assert.match(source, /GH_TOKEN/);
    assert.match(source, /api\.github\.com\/repos/);
    assert.match(source, /branch=.*master|nightlyBranch = "master"/);
  }
  assert.match(packPowerShell, /if \(\$hasGitHubToken\)/);
  assert.match(packShell, /if \[\[ -n "\$\{github_token\}" \]\]/);
  assert.doesNotMatch(packShell, /releases\/expanded_assets|releases\/download|FlashGot-v/);
});

test("Windows and Linux share one runtime capability matrix and universal XPI", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const script = read("addon/chrome/content/options.js");
  const markup = read("addon/chrome/content/options.xhtml");
  const workflow = read(".github/workflows/test.yml");

  assert.match(
    service,
    /PLATFORM_DEFINITIONS = Object\.freeze\(\{[\s\S]*?WINNT:[\s\S]*?id: "windows"[\s\S]*?Linux:[\s\S]*?id: "linux"/,
  );
  assert.match(service, /platformSupported: Boolean\(this\.platformDefinition\)/);
  assert.match(service, /flashGotSupported: Boolean\(this\.platformDefinition\?\.flashGotSupported\)/);
  assert.match(service, /processWindowHidingSupported: Boolean\(/);
  assert.match(service, /serviceReady: this\.serviceReady/);
  assert.match(service, /availableManagerCount: managers\.length/);
  assert.match(service, /this\.platformDefinition\.flashGotSupported[\s\S]*?this\.deployBinary\(\)/);
  assert.match(service, /if \(!this\.platformDefinition\?\.flashGotSupported\) \{\s*return \[\];/);
  assert.match(service, /this\.platformDefinition\?\.id === "linux"[\s\S]*?file\.isExecutable\(\)/);
  assert.match(service, /if \(this\.platformDefinition\?\.processWindowHidingSupported\)/);
  assert.match(markup, /id="custom-start-hidden-row"/);
  assert.match(script, /custom-start-hidden-row"\)\.hidden =\s*!state\.snapshot\?\.processWindowHidingSupported/);
  assert.match(script, /service\.platform === "linux"[\s\S]*?"downloadit-linux"/);
  assert.match(script, /"downloadit-component-not-used"/);
  assert.match(script, /application: linux/);

  for (const locale of ["en-US", "zh-CN"]) {
    const fluent = read(`addon/chrome/content/locales/${locale}/downloadit.ftl`);
    for (const id of [
      "downloadit-linux",
      "downloadit-component-not-used",
      "downloadit-jdownloader-jar-file-filter",
      "downloadit-error-flashgot-platform",
    ]) {
      assert.match(fluent, new RegExp(`^${id}\\s*=`, "m"));
    }
  }
  for (const readme of ["README.md", "README-zh_CN.md"]) {
    const source = read(readme);
    for (const text of ["Windows", "Linux", "Snap", "Flatpak", "FlashGot.exe"] ) {
      assert.match(source, new RegExp(text.replaceAll(".", "\\.")));
    }
  }

  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /run: node --test/);
  assert.match(workflow, /run: bash -n pack\.sh/);
});

test("settings dialog contains the current capability controls", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  assert.doesNotMatch(markup, /chrome:\/\/global\/skin\/menulist\.css/);
  assert.match(
    markup,
    /<img id="developer-mode-trigger" class="brand-mark" src="chrome:\/\/downloadit\/content\/icons\/downloadit\.svg" alt="" aria-hidden="true" draggable="false" \/>/,
  );
  assert.doesNotMatch(markup, /class="brand-mark"[^>]*>DI<\/div>/);
  assert.match(markup, /xmlns:xul="http:\/\/www\.mozilla\.org\/keymaster\/gatekeeper\/there\.is\.only\.xul"/);
  assert.match(markup, /<xul:menulist id="default-manager"/);
  assert.match(markup, /<xul:menupopup id="default-manager-popup"/);
  assert.match(markup, /<link rel="localization" href="downloadit\.ftl"/);
  assert.match(markup, /<script[^>]+src="chrome:\/\/downloadit\/content\/options\.js"/);
  for (const id of [
    "section-managers",
    "default-manager",
    "auto-start-tasks",
    "auto-start-tasks-lock",
    "add-download-tool",
    "download-tool-editor",
    "tool-kind-builtin",
    "tool-kind-custom",
    "tool-editor-builtin",
    "tool-editor-custom",
    "built-in-protocol",
    "jdownloader-endpoint",
    "jdownloader-auto-launch",
    "jdownloader-launch-path",
    "browse-jdownloader-path",
    "clear-jdownloader-path",
    "jdownloader-detected-path",
    "test-jdownloader",
    "jdownloader-test-state",
    "refresh-managers",
    "section-auto-capture",
    "auto-capture-config-error",
    "retry-auto-capture-rules",
    "reset-auto-capture-rules",
    "auto-allow-input",
    "add-auto-allow",
    "auto-allow-list",
    "clear-auto-allow",
    "auto-deny-input",
    "add-auto-deny",
    "auto-deny-list",
    "clear-auto-deny",
    "section-link-groups",
    "built-in-link-group-list",
    "custom-link-group-list",
    "add-custom-link-group",
    "link-group-editor",
    "link-group-name",
    "link-group-key",
    "link-group-extensions",
    "developer-mode-trigger",
    "section-mirrors",
    "mirror-settings-lock",
    "mirror-adapter-list",
    "mirror-validation",
    "mirror-validation-message",
    "section-privacy",
    "send-cookies",
    "idm-bridge",
    "idm-bridge-lock",
    "section-about",
    "apply",
    "cancel",
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
});

test("automatic capture controls live in a dedicated settings tab", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const script = read("addon/chrome/content/options.js");
  const styles = read("addon/chrome/content/options.css");
  const managerPanel = markup.match(
    /<section id="section-managers"[\s\S]*?<\/section>/,
  )?.[0];
  const autoCapturePanel = markup.match(
    /<section id="section-auto-capture"[\s\S]*?<\/section>/,
  )?.[0];

  assert.match(
    markup,
    /aria-controls="section-auto-capture" data-section="auto-capture"/,
  );
  assert.equal((markup.match(/class="nav-item(?: is-active)?"/g) || []).length, 6);
  assert.ok(managerPanel);
  assert.ok(autoCapturePanel);
  assert.doesNotMatch(managerPanel, /id="auto-allow-list"/);
  assert.match(autoCapturePanel, /data-section-panel="auto-capture"/);
  assert.match(autoCapturePanel, /id="auto-allow-list"/);
  assert.match(autoCapturePanel, /id="auto-deny-list"/);
  assert.match(autoCapturePanel, /id="clear-auto-allow"/);
  assert.match(autoCapturePanel, /id="clear-auto-deny"/);
  assert.match(autoCapturePanel, /id="auto-capture-config-error"/);
  assert.match(autoCapturePanel, /id="retry-auto-capture-rules"/);
  assert.match(autoCapturePanel, /id="reset-auto-capture-rules"/);
  assert.match(script, /"auto-capture": \[/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(
    styles,
    /\.section-nav\.has-developer-mode[\s\S]*?repeat\(6, minmax\(0, 1fr\)\)/,
  );
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
  assert.match(script, /autoCaptureRules/);
  assert.match(script, /linkGroups/);
  assert.match(script, /mirrorSettings/);
  assert.match(script, /validateLinkGroupSettings/);
  assert.match(script, /idmBridgeEnabled/);
  assert.match(script, /data-remove-auto-rule/);
  assert.match(script, /downloadit-remove-auto-allow/);
  assert.match(script, /downloadit-remove-auto-deny/);
  assert.match(script, /reloadAutoCaptureRules/);
  assert.match(script, /resetAutoCaptureRules/);
  assert.match(script, /customDownloaders/);
  assert.match(script, /reloadCustomDownloaders/);
  assert.match(script, /testAria2Configuration/);
  assert.match(script, /testJDownloaderConfiguration/);
  assert.match(script, /autoStartTasks/);
  assert.match(script, /jdownloader/);
  assert.match(
    script,
    /"inIsolatedMozBrowser" in window\.browsingContext\.originAttributes/,
  );
  assert.match(script, /\? window\.browsingContext : window/);
  assert.match(script, /picker\.init\(pickerParent, title, Ci\.nsIFilePicker\.modeOpen\)/);
});

test("JDownloader provider settings and guarded local protocol are wired end to end", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const script = read("addon/chrome/content/options.js");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const downloaders = read("addon/chrome/content/DownloadItDownloaders.sys.mjs");

  for (const preference of [
    "downloadit.autoStartTasks",
    "downloadit.jdownloader.enabled",
    "downloadit.jdownloader.endpoint",
    "downloadit.jdownloader.launchPath",
    "downloadit.jdownloader.autoLaunch",
    "downloadit.jdownloader.detectedPath",
    "downloadit.jdownloader.detectedJavaArgs",
  ]) {
    assert.match(service, new RegExp(preference.replaceAll(".", "\\.")));
  }
  assert.match(service, /provider: JDOWNLOADER_PROVIDER/);
  assert.match(service, /downloadViaJDownloader/);
  assert.match(service, /JDOWNLOADER_RETRY_DELAY_MS = 8000/);
  assert.match(service, /JDOWNLOADER_MAX_STARTUP_PROBES = 6/);
  assert.match(service, /jDownloaderStartupPromise/);
  assert.match(service, /process\.startHidden = Boolean\(startHidden\)/);
  assert.match(service, /channel\.redirectionLimit = 0/);
  assert.match(service, /Ci\.nsIRequest\.LOAD_BYPASS_CACHE/);
  assert.match(service, /createPrivilegedXMLHttpRequest\(\)/);
  assert.match(service, /new globalThis\.XMLHttpRequest\(\)/);
  assert.doesNotMatch(service, /xmlextras\/xmlhttprequest/);
  assert.match(service, /allowDeprecatedSystemRequests = true/);
  assert.match(service, /Ci\.nsILoadInfo\.HTTPS_ONLY_EXEMPT/);
  assert.match(service, /getJDownloaderReferer\(endpoint\)/);
  assert.match(service, /channel\.setNewReferrerInfo\(/);
  assert.match(service, /Ci\.nsIReferrerInfo\.UNSAFE_URL/);
  assert.doesNotMatch(service, /channel\.setRequestHeader\(\s*"Referer"/);
  assert.match(service, /application\/x-www-form-urlencoded; charset=UTF-8/);
  assert.match(downloaders, /JDOWNLOADER_PROVIDER = "jdownloader"/);
  assert.match(downloaders, /BUILT_IN_PROTOCOLS = Object\.freeze/);
  assert.match(downloaders, /taskStart: true/);
  assert.match(downloaders, /hostname === "::1"/);
  assert.match(downloaders, /url\.protocol !== "http:"/);
  assert.match(downloaders, /url\.username/);
  assert.match(downloaders, /url\.search/);
  assert.match(downloaders, /params\.set\("autostart"/);
  assert.match(downloaders, /jdownloader-mixed-post-data/);
  assert.match(script, /createJDownloaderDescriptor\(jDownloaderDraft\)/);
  assert.match(script, /data-remove-built-in/);
  assert.match(script, /removeBuiltInDownloader/);
  assert.match(service, /refreshConfiguredBuiltInProtocols/);
  assert.match(service, /Promise\.allSettled\(probes\)/);
  assert.match(script, /watchBuiltInRefresh/);
  assert.match(script, /filter: linux \? "\*\.jar" : "\*\.exe;\*\.jar"/);
  assert.match(script, /application: linux/);
  assert.match(script, /picker\.appendFilters\(Ci\.nsIFilePicker\.filterApps\)/);
  assert.match(script, /picker\.appendFilter\(await document\.l10n\.formatValue\(filterId\), filter\)/);
  assert.match(script, /includeAllFiles: false/);
  assert.match(markup, /id="jdownloader-launch-path"[^>]+readonly="readonly"/);

  const errorCodes = [
    "jdownloader-endpoint-invalid",
    "jdownloader-unavailable",
    "jdownloader-discovery-invalid",
    "jdownloader-http-error",
    "jdownloader-launch-path-invalid",
    "jdownloader-launch-failed",
    "jdownloader-start-timeout",
    "jdownloader-submit-failed",
    "jdownloader-mixed-post-data",
  ];
  for (const relativePath of [
    "addon/chrome/content/options.js",
    "addon/chrome/content/DownloadItContextMenu.sys.mjs",
    "addon/chrome/content/DownloadItDownloadDialog.sys.mjs",
    "addon/chrome/content/links.js",
  ]) {
    const source = read(relativePath);
    for (const code of errorCodes) {
      assert.match(source, new RegExp(`"${code}"`));
    }
  }

  for (const relativePath of ["README.md", "README-zh_CN.md"]) {
    const source = read(relativePath);
    for (const text of [
      "jdownloader:jdownloader",
      "downloadit.autoStartTasks",
      "downloadit.jdownloader.enabled",
      "downloadit.jdownloader.endpoint",
      "downloadit.jdownloader.launchPath",
      "downloadit.jdownloader.autoLaunch",
      "downloadit.jdownloader.detectedPath",
      "downloadit.jdownloader.detectedJavaArgs",
      "127.0.0.0/8",
      "JDownloader2.exe",
      "dpass",
      "apass",
    ]) {
      assert.match(source, new RegExp(text.replaceAll(".", "\\.")));
    }
  }
});

test("settings dialog exposes a unified download-tool editor", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const script = read("addon/chrome/content/options.js");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const downloaders = read("addon/chrome/content/DownloadItDownloaders.sys.mjs");
  for (const id of [
    "add-download-tool",
    "reload-custom-downloaders",
    "retry-custom-downloaders",
    "reset-custom-downloaders",
    "download-tool-editor",
    "tool-editor-save",
    "tool-kind-builtin",
    "tool-kind-custom",
    "tool-editor-builtin",
    "tool-editor-custom",
    "built-in-protocol",
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
  assert.match(
    markup,
    /id="tool-kind-builtin"[^>]+class="editor-kind-tab is-active"[^>]+aria-selected="true"/,
  );
  assert.match(markup, /id="tool-editor-custom"[^>]+hidden="hidden"/);
  assert.match(markup, /data-built-in-protocol-fields="jdownloader"/);
  assert.match(
    markup,
    /<details class="advanced-settings">[\s\S]*?id="jdownloader-endpoint"[\s\S]*?<\/details>/,
  );
  const managerPanel = markup.slice(
    markup.indexOf('<section id="section-managers"'),
    markup.indexOf('<section id="section-auto-capture"'),
  );
  assert.doesNotMatch(managerPanel, /id="jdownloader-endpoint"/);
  assert.doesNotMatch(
    markup,
    /class="segmented-control"[^>]+data-l10n-id="downloadit-custom-type-label"/,
  );
  assert.match(script, /startHidden: document\.getElementById\("custom-start-hidden"\)\.checked/);
  assert.match(script, /function openDownloadToolEditor\(kind = "builtin"/);
  assert.match(script, /state\.draft\.builtInProtocols\[protocol\] =/);
  assert.match(script, /enabled: true/);
  assert.match(script, /settings\.enabled = false/);
  assert.match(script, /kind === "custom" && customBlocked/);
  assert.match(
    script,
    /getElementById\("add-download-tool"\)\.disabled =\s*state\.busy \|\| !state\.service/,
  );
  assert.doesNotMatch(script, /customDownloaders\.downloaders\.push\([^)]*jdownloader/i);
  assert.match(service, /process\.startHidden = Boolean\(startHidden\)/);
  assert.match(service, /builtInProtocols: this\.getBuiltInProtocols\(\)/);
  assert.match(service, /builtInProtocols\[JDOWNLOADER_PROVIDER\]/);
  assert.match(script, /configurationPath: state\.service\.normalizeCustomFilePathForStorage/);
  assert.match(downloaders, /`--conf-path=\$\{configurationPath\}`/);
  assert.match(script, /createManagerCapabilities/);
  assert.match(script, /DOWNLOADER_CAPABILITY_KEYS/);
  assert.match(service, /getFlashGotDownloaderCapabilities/);
  assert.match(service, /getCustomDownloaderCapabilities/);
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
  assert.match(service, /getAbsolutePathPlatform\(path\)/);
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

test("automatic capture rules are versioned, profile-scoped, and atomic", () => {
  const rules = read("addon/chrome/content/DownloadItAutoCapture.sys.mjs");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  for (const source of [service, englishReadme, chineseReadme]) {
    assert.doesNotMatch(source, /downloadit\.autoExtensions/);
    assert.match(source, /auto-capture-rules\.json/);
  }
  assert.match(rules, /AUTO_CAPTURE_RULES_VERSION = 1/);
  assert.match(rules, /BUILT_IN_AUTO_CAPTURE_DENY/);
  assert.match(rules, /extension: "xpi"/);
  assert.match(rules, /match\.type !== "extension"/);
  assert.match(rules, /stringifyAutoCaptureDocument/);
  assert.match(service, /AUTO_CAPTURE_RULES_FILE = "auto-capture-rules\.json"/);
  assert.match(service, /autoCaptureRulesLoadError/);
  assert.match(service, /reloadAutoCaptureRules\(\)/);
  assert.match(service, /writeAutoCaptureRules\(document\)/);
  assert.match(service, /IOUtils\.writeUTF8\([\s\S]*this\.autoCaptureRulesPath,[\s\S]*\{ tmpPath: temporaryPath \}/);
  assert.match(service, /autoCaptureRulesWritePromise/);
});

test("link groups are validated, policy-aware, and documented", () => {
  const links = read("addon/chrome/content/DownloadItLinks.sys.mjs");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  assert.match(links, /validateLinkGroupSettings/);
  assert.match(links, /extension-duplicate/);
  assert.match(service, /PREF_LINK_GROUPS = "downloadit\.linkGroups"/);
  assert.match(service, /linkGroupsLocked/);
  for (const source of [englishReadme, chineseReadme]) {
    assert.match(source, /downloadit\.linkGroups/);
  }
});

test("IDM bridge is staged, policy-aware, packaged, and documented", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const bridge = read("addon/chrome/content/DownloadItIDMBridge.sys.mjs");
  const packPowerShell = read("pack.ps1");
  const packShell = read("pack.sh");
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  for (const source of [service, englishReadme, chineseReadme]) {
    assert.match(source, /downloadit\.idmBridgeEnabled/);
  }
  assert.match(service, /idmBridgeLocked/);
  assert.match(service, /downloadIDMTask/);
  assert.match(bridge, /http-on-modify-request/);
  assert.match(bridge, /redirectTo/);
  assert.match(bridge, /LoopbackOnly/);
  assert.match(bridge, /\/downloadit-idm\//);
  assert.match(bridge, /Ci\.nsITransport\.OPEN_BLOCKING/);
  for (const source of [service, bridge, read("addon/chrome/content/options.js")]) {
    assert.doesNotMatch(source, /linkswift/i);
  }
  for (const source of [packPowerShell, packShell]) {
    assert.match(source, /DownloadItIDMBridge\.sys\.mjs/);
    assert.match(source, /DownloadItIDMProtocol\.sys\.mjs/);
  }
});

test("mirror adapters are validated, policy-aware, packaged, and documented", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const mirrors = read("addon/chrome/content/DownloadItMirrors.sys.mjs");
  const github = read("addon/chrome/content/DownloadItGitHubMirror.sys.mjs");
  const options = read("addon/chrome/content/options.js");
  const styles = read("addon/chrome/content/options.css");
  const packPowerShell = read("pack.ps1");
  const packShell = read("pack.sh");
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  assert.match(service, /PREF_MIRRORS = "downloadit\.mirrors"/);
  assert.match(service, /PREF_DEVELOPER_MODE = "downloadit\.developerMode"/);
  assert.match(service, /activateDeveloperMode\(\)/);
  assert.match(service, /dispatchDownload/);
  assert.match(service, /mirrorSettingsLocked/);
  assert.match(service, /channel\?\.originalURI/);
  assert.match(mirrors, /class MirrorAdapterRegistry/);
  assert.match(mirrors, /MIRROR_SETTINGS_VERSION = 1/);
  assert.match(github, /GITHUB_MIRROR_DEFAULT_ENDPOINT = "https:\/\/gh-proxy\.com\/"/);
  assert.match(options, /validateMirrorSettings/);
  assert.match(options, /dataset\.mirrorEndpoint/);
  assert.match(options, /DEVELOPER_MODE_DOUBLE_CLICKS = 6/);
  assert.match(options, /addEventListener\([\s\S]*?"dblclick"/);
  assert.match(options, /state\.section = "mirrors"/);
  assert.match(
    markup,
    /id="developer-mode-trigger"[\s\S]*?data-section="mirrors" hidden="hidden"/,
  );
  assert.match(styles, /\.mirror-group \{[\s\S]*?padding: 19px 22px 14px/);
  assert.match(styles, /body\[data-active-section="mirrors"\] \.content-scroll/);
  for (const source of [packPowerShell, packShell]) {
    assert.match(source, /DownloadItGitHubMirror\.sys\.mjs/);
    assert.match(source, /DownloadItMirrors\.sys\.mjs/);
  }
  for (const source of [englishReadme, chineseReadme]) {
    assert.match(source, /downloadit\.mirrors/);
    assert.doesNotMatch(source, /developer[.\s-]?mode|开发者模式/i);
    assert.match(source, /https:\/\/gh-proxy\.com\//);
    assert.match(source, /raw\.githubusercontent\.com/);
  }
});
