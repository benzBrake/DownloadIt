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
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const script = read("addon/chrome/content/options.js");
  const markup = read("addon/chrome/content/options.xhtml");
  const version = manifest.match(/<em:version>([^<]+)<\/em:version>/)?.[1];

  assert.match(version || "", /^\d+\.\d+\.\d+$/);
  assert.ok(Number(version.split(".")[0]) >= 2);
  assert.match(manifest, /<em:iconURL>chrome:\/\/downloadit\/content\/icons\/downloadit\.svg<\/em:iconURL>/);
  assert.match(manifest, /<em:optionsURL>chrome:\/\/downloadit\/content\/options\.xhtml<\/em:optionsURL>/);
  assert.match(manifest, /<em:optionsType>1<\/em:optionsType>/);
  assert.match(manifest, /<em:optionsResizable>true<\/em:optionsResizable>/);
  assert.match(manifest, /<em:optionsWidth>1080<\/em:optionsWidth>/);
  assert.match(manifest, /<em:optionsHeight>720<\/em:optionsHeight>/);
  assert.match(service, /addonVersion: String\(this\.addonData\?\.version \|\| ""\)/);
  assert.match(markup, /<dd id="addon-version">--<\/dd>/);
  assert.match(
    script,
    /getElementById\("addon-version"\)\.textContent =\s*snapshot\?\.addonVersion \|\| "--"/,
  );
  assert.doesNotMatch(
    markup,
    /<dd id="addon-version">\d+(?:\.\d+)+<\/dd>/,
  );
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
  assert.doesNotMatch(packShell, /releases\/expanded_assets|FlashGot-v/);
});

test("Aria2Next packaging pins and verifies universal XPI assets", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const options = read("addon/chrome/content/options.js");
  const packPowerShell = read("pack.ps1");
  const packShell = read("pack.sh");
  const notices = read("addon/THIRD_PARTY_NOTICES.txt");
  const license = read("addon/licenses/aria2-next-COPYING");

  const expectedValues = [
    "AnInsomniacy/aria2-next",
    "2.5.5",
    "aria2-next-2.5.5-windows-x86_64.exe",
    "aria2-next-2.5.5-linux-x86_64",
    "4555264",
    "3852672",
    "554f2f81ca53731dc9e01710cfb16081a34759f3276ff16eb4b12656c1b6e5b9",
    "b6f2cdadcd34ba16dd7fcb29de4b84c36f893f9b223a9a05157d1892687a45a0",
  ];
  for (const source of [packPowerShell, packShell]) {
    for (const value of expectedValues) {
      assert.match(source, new RegExp(value.replaceAll(".", "\\.")));
    }
    for (const entry of [
      "aria2-next.exe",
      "aria2-next-linux-x86_64",
      "licenses/aria2-next-COPYING",
    ]) {
      assert.match(source, new RegExp(entry.replaceAll(".", "\\.")));
    }
    assert.match(source, /ARIA2NEXT_BINARY_METADATA/);
  }

  assert.match(service, /Services\.appinfo\.XPCOMABI/);
  assert.match(service, /aria2NextSupported: this\.isAria2NextSupported\(\)/);
  assert.match(service, /IOUtils\.setPermissions\(destination, 0o755\)/);
  assert.match(options, /downloadit-aria2next-status-unsupported/);
  assert.match(notices, /Aria2Next[\s\S]*v2\.5\.5[\s\S]*GPL-2\.0/);
  assert.match(license, /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 2, June 1991/);
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
  assert.match(service, /function isExecutableLocalFile\(file, platform\)/);
  assert.match(service, /platform !== "linux"[\s\S]*?file\.isExecutable\(\)/);
  assert.match(service, /if \(this\.platformDefinition\?\.processWindowHidingSupported\)/);
  assert.match(markup, /id="custom-start-hidden-row"/);
  assert.match(script, /custom-start-hidden-row"\)\.hidden =\s*!state\.snapshot\?\.processWindowHidingSupported/);
  assert.match(script, /service\.platform === "linux"[\s\S]*?"downloadit-linux"/);
  assert.match(script, /"downloadit-component-not-used"/);
  assert.match(script, /application: false,\s*absolute: true,\s*includeAllFiles: linux/);

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
  assert.match(workflow, /name: Build XPI/);
  assert.match(workflow, /run: \.\\pack\.ps1/);
});

test("about callout exposes the localized easter egg toast trigger", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const script = read("addon/chrome/content/options.js");
  assert.match(
    markup,
    /<button\s+id="callout-mark"[\s\S]*data-l10n-id="downloadit-about-callout-mark"/,
  );
  assert.match(script, /showDownloadItToast\(window, message\)/);
  for (const locale of ["en-US", "zh-CN"]) {
    const source = read(`addon/chrome/content/locales/${locale}/downloadit.ftl`);
    for (let index = 1; index <= 10; index++) {
      assert.match(source, new RegExp(`^downloadit-easter-egg-log-${index} =`, "m"));
    }
  }
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
  assert.match(markup, /<xul:menulist id="magnet-manager"/);
  assert.match(markup, /<xul:menupopup id="magnet-manager-popup"/);
  assert.match(markup, /<xul:menulist id="ed2k-manager"/);
  assert.match(markup, /<xul:menupopup id="ed2k-manager-popup"/);
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
    "abdm-enabled",
    "abdm-endpoint",
    "abdm-api-key",
    "abdm-status",
    "abdm-lock",
    "test-abdm",
    "abdm-test-state",
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
    "keep-profile-data-on-uninstall",
    "keep-profile-data-on-uninstall-lock",
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
  assert.match(script, /renderedProtocolManagerKeys/);
  assert.match(script, /syncProtocolDefaultSelection\(select, popup, selectedKey\)/);
  assert.match(script, /select\.selectedIndex = \[\.\.\.popup\.children\]\.indexOf\(selectedItem\)/);
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
  assert.match(
    script,
    /const builtInProviders = new Set\([\s\S]*?BUILT_IN_PROTOCOLS\.map\(protocol => protocol\.provider\)[\s\S]*?\);[\s\S]*?!builtInProviders\.has\(downloader\.ref\?\.provider\)/,
  );
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

test("protocol manager selectors reuse the default manager XUL styling", () => {
  const styles = read("addon/chrome/content/options.css");
  const enUS = read("addon/chrome/content/locales/en-US/downloadit.ftl");
  const zhCN = read("addon/chrome/content/locales/zh-CN/downloadit.ftl");

  for (const id of ["magnet-manager", "ed2k-manager"]) {
    assert.match(styles, new RegExp(`#${id}[,\\s]`));
  }
  assert.match(enUS, /downloadit-protocol-default-none\s*=\s*\r?\n\s*\.label = Firefox native handling/);
  assert.match(zhCN, /downloadit-protocol-default-none\s*=\s*\r?\n\s*\.label = Firefox 原生处理/);
});

test("built-in provider settings and guarded local protocols are wired end to end", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  const script = read("addon/chrome/content/options.js");
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");
  const downloaders = read("addon/chrome/content/DownloadItDownloaders.sys.mjs");

  for (const preference of [
    "downloadit.autoStartTasks",
    "downloadit.abdm.enabled",
    "downloadit.abdm.endpoint",
    "downloadit.abdm.apiKey",
    "downloadit.xdm.enabled",
    "downloadit.xdm.launchPath",
    "downloadit.uget.enabled",
    "downloadit.uget.launchPath",
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
  assert.match(service, /provider: ABDM_PROVIDER/);
  assert.match(service, /provider: XDM_PROVIDER/);
  assert.match(service, /provider: UGET_PROVIDER/);
  assert.match(service, /downloadViaABDM/);
  assert.match(service, /downloadViaXDM/);
  assert.match(service, /downloadViaUGet/);
  assert.match(service, /GET/);
  assert.match(service, /queues/);
  assert.match(service, /add/);
  assert.match(service, /X-Api-Key/);
  assert.match(downloaders, /http:\/\/127\.0\.0\.1:8597\//);
  assert.match(service, /"sync"/);
  assert.match(downloaders, /"download"/);
  assert.match(downloaders, /"link"/);
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
  assert.match(downloaders, /UGET_PROVIDER = "uget"/);
  assert.match(downloaders, /BUILT_IN_PROTOCOLS = Object\.freeze/);
  assert.match(downloaders, /taskStart: true/);
  assert.match(downloaders, /hostname === "::1"/);
  assert.match(downloaders, /url\.protocol !== "http:"/);
  assert.match(downloaders, /url\.username/);
  assert.match(downloaders, /url\.search/);
  assert.match(downloaders, /params\.set\("autostart"/);
  assert.match(downloaders, /jdownloader-mixed-post-data/);
  assert.match(script, /createJDownloaderDescriptor\(jDownloaderDraft\)/);
  assert.match(script, /!builtInProviders\.has\(downloader\.ref\?\.provider\)/);
  assert.match(script, /createXDMDescriptor\(xdmDraft\)/);
  assert.match(script, /createUGetDescriptor\(uGetDraft\)/);
  assert.match(
    script,
    /function isBuiltInDownloader\(downloader\) \{[\s\S]*?BUILT_IN_PROTOCOLS\.some/,
  );
  assert.match(script, /data-remove-built-in/);
  assert.match(script, /removeBuiltInDownloader/);
  assert.match(service, /refreshConfiguredBuiltInProtocols/);
  assert.match(service, /Promise\.allSettled\(probes\)/);
  assert.match(script, /watchBuiltInRefresh/);
  assert.match(script, /filter: linux \? "\*\.jar" : "\*\.exe;\*\.jar"/);
  assert.match(
    script,
    /async function browseXDMPath\(\) \{[\s\S]*?filterId: linux \? "" : "downloadit-xdm-file-filter"[\s\S]*?filter: linux \? "" : "\*\.exe;\*\.jar"/,
  );
  assert.match(script, /application: false,\s*absolute: true,\s*includeAllFiles: linux/);
  assert.match(script, /picker\.appendFilters\(Ci\.nsIFilePicker\.filterApps\)/);
  assert.match(script, /picker\.appendFilter\(await document\.l10n\.formatValue\(filterId\), filter\)/);
  assert.match(script, /includeAllFiles: linux/);
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
    "abdm-endpoint-invalid",
    "abdm-api-key-invalid",
    "abdm-unavailable",
    "abdm-http-error",
    "abdm-response-invalid",
    "abdm-submit-failed",
    "abdm-post-unsupported",
    "abdm-launch-path-invalid",
    "abdm-launch-failed",
    "abdm-start-timeout",
    "xdm-unavailable",
    "xdm-disabled",
    "xdm-http-error",
    "xdm-response-invalid",
    "xdm-submit-failed",
    "xdm-post-unsupported",
    "xdm-launch-path-invalid",
    "xdm-launch-failed",
    "xdm-start-timeout",
    "uget-unavailable",
    "uget-launch-path-invalid",
    "uget-launch-failed",
    "uget-submit-failed",
    "uget-partial-failure",
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
      "abdm:abdm",
      "downloadit.abdm.enabled",
      "downloadit.abdm.endpoint",
      "downloadit.abdm.apiKey",
      "downloadit.abdm.launchPath",
      "xdm:xdm",
      "downloadit.xdm.enabled",
      "downloadit.xdm.launchPath",
      "uget:uget",
      "downloadit.uget.enabled",
      "downloadit.uget.launchPath",
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
    "xdm-enabled",
    "xdm-status",
    "test-xdm",
    "xdm-launch-path",
    "browse-xdm-path",
    "clear-xdm-path",
    "edit-xdm-path",
    "uget-enabled",
    "uget-status",
    "test-uget",
    "uget-launch-path",
    "browse-uget-path",
    "clear-uget-path",
    "edit-uget-path",
    "abdm-launch-path",
    "browse-abdm-path",
    "clear-abdm-path",
    "edit-abdm-path",
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
  assert.match(markup, /data-built-in-protocol-fields="xdm"/);
  assert.match(markup, /data-built-in-protocol-fields="uget"/);
  assert.match(markup, /id="xdm-launch-path"[^>]+readonly="readonly"/);
  assert.match(markup, /id="abdm-launch-path"[^>]+readonly="readonly"/);
  for (const id of [
    "browse-jdownloader-path",
    "clear-jdownloader-path",
    "browse-xdm-path",
    "edit-xdm-path",
    "clear-xdm-path",
  ]) {
    assert.match(
      markup,
      new RegExp(`id="${id}"[^>]+class="secondary-button path-action-button"`),
    );
  }
  assert.doesNotMatch(
    markup,
    /id="edit-xdm-path"[^>]*>[^<]*&#x270e;/,
  );
  assert.match(markup, /id="edit-abdm-path"[^>]+class="icon-button"[^>]*>&#x270e;<\/button>/);
  assert.match(markup, /id="edit-uget-path"[^>]+class="icon-button"[^>]*>&#x270e;<\/button>/);
  assert.match(script, /function enableXDMPathInput\(\)/);
  assert.match(script, /function enableABDMPathInput\(\)/);
  assert.match(script, /function enableUGetPathInput\(\)/);
  assert.match(script, /async function browseUGetPath\(\)/);
  assert.match(script, /async function browseABDMPath\(\)/);
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
  assert.match(script, /editingKind: id \? kind : ""/);
  assert.match(script, /state\.draft\.builtInProtocols\[protocol\] =/);
  assert.match(script, /enabled: settings\.enabled/);
  assert.doesNotMatch(script, /enabled: protocol === XDM_PROVIDER/);
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
  assert.match(service, /builtInProtocols\[XDM_PROVIDER\]/);
  assert.match(service, /builtInProtocols\[UGET_PROVIDER\]/);
  assert.match(script, /createXDMDescriptor/);
  assert.match(script, /createUGetDescriptor/);
  assert.match(script, /normalizeXDMSettings/);
  assert.match(script, /configurationPath: state\.service\.normalizeCustomFilePathForStorage/);
  assert.match(downloaders, /`--conf-path=\$\{configurationPath\}`/);
  assert.match(script, /createManagerCapabilities/);
  assert.match(script, /DOWNLOADER_CAPABILITY_KEYS/);
  assert.match(service, /getFlashGotDownloaderCapabilities/);
  assert.match(service, /getCustomDownloaderCapabilities/);
  assert.match(
    script,
    /downloader\.capabilities\?\.\[protocol\] === true &&\s*\(downloader\.available \|\| downloader\.enabled\)/,
  );
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
