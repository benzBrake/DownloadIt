import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const _globalSnapshot = new Map(Object.entries(globalThis));

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(
  projectRoot,
  "addon/chrome/content/DownloadItAriaNg.sys.mjs",
);

let importCounter = 0;
let actorHarness = null;

async function loadAriaNgModule(MockExtension) {
  actorHarness = {
    registrations: [],
    unregistrations: [],
  };
  globalThis.Services = {
    io: {
      newURI: spec => ({ spec }),
    },
  };
  globalThis.ChromeUtils = {
    registerWindowActor(name, options) {
      actorHarness.registrations.push({ name, options });
    },
    unregisterWindowActor(name) {
      actorHarness.unregistrations.push(name);
    },
    importESModule(spec) {
      if (spec.endsWith("/Extension.sys.mjs")) {
        return { Extension: MockExtension };
      }
      if (spec.endsWith("/Services.sys.mjs")) {
        return { Services: globalThis.Services };
      }
      throw new Error(`Unexpected module import: ${spec}`);
    },
  };
  importCounter += 1;
  return import(`${pathToFileURL(modulePath).href}?test=${importCounter}`);
}

function createAddonData() {
  return {
    blocklistState: 0,
    temporarilyInstalled: true,
    resourceURI: {
      resolve(relativePath) {
        return `jar:file:///DownloadIt.xpi!/${relativePath}`;
      },
    },
  };
}

test("AriaNg uses a native embedded Extension with a stable internal identity", async () => {
  const instances = [];
  class MockExtension {
    constructor(addonData, startupReason) {
      this.addonData = addonData;
      this.startupReason = startupReason;
      this.shutdownReasons = [];
      this.policy = {
        active: false,
        getURL: relativePath => `moz-extension://profile-uuid/${relativePath}`,
      };
      instances.push(this);
    }

    async startup() {
      this.policy.active = true;
    }

    async shutdown(reason) {
      this.shutdownReasons.push(reason);
      this.policy.active = false;
    }
  }

  const ariaNg = await loadAriaNgModule(MockExtension);
  assert.equal(ariaNg.getAriaNgURL(), "");

  const url = await ariaNg.startAriaNg(createAddonData(), "ADDON_ENABLE");
  assert.equal(url, "moz-extension://profile-uuid/index.html");
  assert.equal(ariaNg.getAriaNgURL(), url);
  assert.deepEqual(actorHarness.registrations, [{
    name: "DownloadItAriaNg",
    options: {
      parent: {
        esModuleURI: "chrome://downloadit/content/DownloadItAriaNgActor.sys.mjs",
      },
      child: {
        esModuleURI: "chrome://downloadit/content/DownloadItAriaNgActor.sys.mjs",
        events: {
          DOMContentLoaded: {},
          load: {},
        },
      },
      allFrames: false,
      matches: ["moz-extension://profile-uuid/*"],
      safeForUntrustedWebProcess: true,
    },
  }]);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].startupReason, "ADDON_ENABLE");
  assert.deepEqual(instances[0].addonData, {
    id: "downloadit-ariang@downloadit.invalid",
    version: "1.3.14",
    type: "extension",
    resourceURI: { spec: "jar:file:///DownloadIt.xpi!/ariang/" },
    isPrivileged: false,
    temporarilyInstalled: true,
    blocklistState: 0,
    startupData: {},
    TEST_NO_ADDON_MANAGER: true,
  });

  assert.equal(
    await ariaNg.startAriaNg(createAddonData(), "APP_STARTUP"),
    url,
  );
  assert.equal(instances.length, 1);

  await ariaNg.stopAriaNg("ADDON_DISABLE");
  await ariaNg.stopAriaNg("ADDON_DISABLE");
  assert.deepEqual(instances[0].shutdownReasons, ["ADDON_DISABLE"]);
  assert.deepEqual(actorHarness.unregistrations, ["DownloadItAriaNg"]);
  assert.equal(ariaNg.getAriaNgURL(), "");
});

test("AriaNg startup failure leaves no exposed moz-extension URL", async () => {
  const shutdownReasons = [];
  class FailingExtension {
    constructor() {
      this.policy = {
        active: false,
        getURL: relativePath => `moz-extension://failed/${relativePath}`,
      };
    }

    async startup() {
      throw new Error("manifest failed");
    }

    async shutdown(reason) {
      shutdownReasons.push(reason);
      this.policy.active = false;
    }
  }

  const ariaNg = await loadAriaNgModule(FailingExtension);
  await assert.rejects(
    ariaNg.startAriaNg(createAddonData()),
    /manifest failed/,
  );
  assert.equal(ariaNg.getAriaNgURL(), "");
  assert.deepEqual(actorHarness.registrations, []);
  assert.deepEqual(actorHarness.unregistrations, []);
  await ariaNg.stopAriaNg();
  assert.deepEqual(shutdownReasons, ["ADDON_DISABLE"]);
});

test("AriaNg manifest grants only loopback RPC access", () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "addon/ariang/manifest.json"),
    "utf8",
  ));

  assert.equal(manifest.manifest_version, 2);
  assert.equal(
    manifest.browser_specific_settings.gecko.id,
    "downloadit-ariang@downloadit.invalid",
  );
  assert.deepEqual(manifest.permissions, [
    "*://127.0.0.1/*",
    "*://localhost/*",
  ]);
  assert.match(manifest.content_security_policy, /script-src 'self';/);
  assert.doesNotMatch(manifest.content_security_policy, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(manifest.content_security_policy, /script-src[^;]*'unsafe-eval'/);
  assert.ok(manifest.content_security_policy.includes("style-src 'self' 'unsafe-inline'"));
  assert.ok(manifest.content_security_policy.includes("connect-src http://127.0.0.1:*"));
  assert.ok(manifest.content_security_policy.includes("ws://localhost:*"));
  assert.doesNotMatch(manifest.content_security_policy, /connect-src\s+\*/);
  assert.ok(!("background" in manifest));
  assert.ok(!("web_accessible_resources" in manifest));
  assert.ok(!manifest.permissions.includes("<all_urls>"));
});

test("AriaNg registration delegates policy and process setup to Firefox", () => {
  const source = fs.readFileSync(modulePath, "utf8");

  assert.match(source, /resource:\/\/gre\/modules\/Extension\.sys\.mjs/);
  assert.match(source, /new Extension\(/);
  assert.doesNotMatch(source, /console\.(?:info|error).*AriaNg/);
  assert.doesNotMatch(source, /describeError/);
  assert.doesNotMatch(source, /new WebExtensionPolicy|extensions\/activeIDs|sharedData/);
  assert.doesNotMatch(source, /userChrome|BootstrapLoader|UcCompatApi/);
});

test("AriaNg packaging pins and verifies the standard release", () => {
  const packPowerShell = fs.readFileSync(
    path.join(projectRoot, "pack.ps1"),
    "utf8",
  );
  const packShell = fs.readFileSync(
    path.join(projectRoot, "pack.sh"),
    "utf8",
  );
  const notices = fs.readFileSync(
    path.join(projectRoot, "addon/THIRD_PARTY_NOTICES.txt"),
    "utf8",
  );
  const license = fs.readFileSync(
    path.join(projectRoot, "addon/licenses/ariang-LICENSE"),
    "utf8",
  );
  const gitignore = fs.readFileSync(
    path.join(projectRoot, ".gitignore"),
    "utf8",
  );
  const expectedValues = [
    "mayswind/AriaNg",
    "1.3.14",
    "AriaNg-1.3.14.zip",
    "1126362",
    "e00db79b4cabac70f71c2673a6d454c8a92bfa9aa1f37bb00b01b7505f956805",
    "11418",
    "76b9dfe56ac19ff5d11578e7e07634601739628716623a95acf389b03a80c1f1",
    "aria-ng-f90ba723d9.min.css",
    "aria-ng-a5324ae04a.min.js",
    "fontawesome-webfont.woff2",
    "ariang/index.html",
    "ariang/manifest.json",
    "licenses/ariang-LICENSE",
    "chrome/content/DownloadItAriaNg.sys.mjs",
  ];

  for (const source of [packPowerShell, packShell]) {
    for (const value of expectedValues) {
      assert.match(source.toLowerCase(), new RegExp(
        value.toLowerCase().replaceAll(".", "\\."),
      ));
    }
    assert.match(source, /release download/);
    assert.match(source, /ghp/);
    assert.match(source, /\bgh\b/);
    assert.match(source, /index\.html/);
    assert.match(source, /ng-csp/);
    assert.match(source, /LICENSE/);
  }

  assert.match(notices, /AriaNg[\s\S]*1\.3\.14[\s\S]*MIT/);
  assert.match(license, /The MIT License \(MIT\)/);
  assert.match(gitignore, /addon\/ariang\/index\.html/);
  assert.match(gitignore, /addon\/ariang\/fonts\//);
});

test("AriaNg documentation and DownloadIt version stay synchronized", () => {
  const manifest = fs.readFileSync(
    path.join(projectRoot, "addon/install.rdf"),
    "utf8",
  );
  const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
  const readmeChinese = fs.readFileSync(
    path.join(projectRoot, "README-zh_CN.md"),
    "utf8",
  );

  assert.match(manifest, /<em:version>2\.9\.0<\/em:version>/);
  for (const source of [readme, readmeChinese]) {
    assert.match(source, /AriaNg/);
    assert.match(source, /1\.3\.14/);
    assert.match(source, /moz-extension:\/\//);
    assert.match(source, /getAriaNgURL\(\)/);
    assert.match(source, /licenses\/ariang-LICENSE/);
    assert.match(source, /2\.9\.0/);
  }
});

after(() => {
  for (const key of Object.keys(globalThis)) {
    if (!_globalSnapshot.has(key)) {
      try { delete globalThis[key]; } catch {}
    }
  }
  for (const [key, value] of _globalSnapshot) {
    try { globalThis[key] = value;
} catch {}
  }
});
