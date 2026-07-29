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

const preferenceValues = new Map();
const preferenceLocks = new Set();
const environmentValues = new Map();
const createdStreams = [];
let xmlHttpRequestFactory = () => ({});
let localFileFactory = () => ({});
let processFactory = () => ({});
let uuidCounter = 0;
const downloadsMock = { ALL: Symbol("Downloads.ALL") };
const downloadPathsMock = {};
const ioUtilsMock = {};
const interfacesMock = {
  nsIChannel: {
    LOAD_BYPASS_URL_CLASSIFIER: 8,
  },
  nsIHttpChannel: Symbol("nsIHttpChannel"),
  nsILoadInfo: {
    HTTPS_ONLY_EXEMPT: 16,
  },
  nsIRequest: {
    LOAD_BYPASS_CACHE: 1,
    INHIBIT_CACHING: 2,
    LOAD_ANONYMOUS: 4,
    TRR_DISABLED_MODE: 32,
  },
  nsIReferrerInfo: { EMPTY: 0, UNSAFE_URL: 1 },
  nsIStringInputStream: Symbol("nsIStringInputStream"),
  nsIUploadChannel2: Symbol("nsIUploadChannel2"),
};
const servicesMock = {
  appinfo: { name: "Firefox", OS: "WINNT" },
  obs: {
    addObserver() {},
    removeObserver() {},
  },
  dirsvc: {
    get: () => ({ path: "C:\\Windows\\System32" }),
  },
  env: {
    get: name => environmentValues.get(name) || "",
  },
  io: { newURI: spec => ({ spec }) },
  prefs: {
    clearUserPref: name => preferenceValues.delete(name),
    getBoolPref: (name, fallback) => preferenceValues.get(name) ?? fallback,
    getStringPref: (name, fallback) => preferenceValues.get(name) ?? fallback,
    prefHasUserValue: name => preferenceValues.has(name),
    prefIsLocked: name => preferenceLocks.has(name),
    setBoolPref: (name, value) => preferenceValues.set(name, value),
    setStringPref: (name, value) => preferenceValues.set(name, value),
  },
  wm: {
    getEnumerator: () => ({
      hasMoreElements: () => false,
      getNext: () => null,
    }),
  },
  uuid: {
    generateUUID: () => {
      uuidCounter += 1;
      return `{11111111-1111-4111-8111-${String(uuidCounter).padStart(12, "0")}}`;
    },
  },
};

globalThis.Components = {
  classes: new Proxy({}, {
    get(_target, contract) {
      if (contract === "@mozilla.org/file/local;1") {
        return { createInstance: () => localFileFactory() };
      }
      if (contract === "@mozilla.org/process/util;1") {
        return { createInstance: () => processFactory() };
      }
      if (contract === "@mozilla.org/io/string-input-stream;1") {
        return {
          createInstance() {
            const stream = {
              data: "",
              setUTF8Data(value) {
                this.data = value;
              },
            };
            createdStreams.push(stream);
            return stream;
          },
        };
      }
      if (contract === "@mozilla.org/referrer-info;1") {
        return {
          createInstance() {
            return {
              init(policy, sendReferrer, originalReferrer) {
                Object.assign(this, { policy, sendReferrer, originalReferrer });
              },
            };
          },
        };
      }
      return { createInstance: () => ({}) };
    },
  }),
  interfaces: interfacesMock,
  results: { NS_BINDING_ABORTED: -1 },
};
globalThis.XMLHttpRequest = function MockXMLHttpRequest() {
  return xmlHttpRequestFactory();
};
globalThis.Services = servicesMock;
globalThis.IOUtils = ioUtilsMock;
globalThis.PathUtils = {
  profileDir: "C:\\Profile",
  isAbsolute: value => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value),
  join: (...parts) => {
    const separator = String(parts[0] || "").startsWith("/") ? "/" : "\\";
    return parts.map((part, index) => {
      const value = String(part);
      return index === 0
        ? value.replace(/[\\/]+$/, "")
        : value.replace(/^[\\/]+|[\\/]+$/g, "");
    }).join(separator);
  },
};
globalThis.ChromeUtils = {
  generateQI: () => function () { return this; },
  registerWindowActor() {},
  unregisterWindowActor() {},
  importESModule(spec) {
    if (spec.endsWith("/Downloads.sys.mjs")) {
      return { Downloads: downloadsMock };
    }
    if (spec.endsWith("/DownloadPaths.sys.mjs")) {
      return { DownloadPaths: downloadPathsMock };
    }
    if (spec.endsWith("/Services.sys.mjs")) {
      return { Services: servicesMock };
    }
    if (spec.endsWith("/Timer.sys.mjs")) {
      return { clearTimeout, setTimeout };
    }
    if (spec.includes("CustomizableUI.sys.mjs")) {
      return { CustomizableUI: {} };
    }
    if (spec.endsWith("/NetUtil.sys.mjs")) {
      return { NetUtil: {} };
    }
    return {};
  },
};

const binaryMetadataPath = path.join(
  projectRoot,
  "addon/chrome/content/DownloadItBinaryMetadata.sys.mjs",
);
const createdBinaryMetadata = !fs.existsSync(binaryMetadataPath);
if (createdBinaryMetadata) {
  fs.writeFileSync(
    binaryMetadataPath,
    "export const BINARY_SIZE = 0;\nexport const BINARY_SHA256 = \"\";\n",
    "utf8",
  );
}
let serviceModule;
try {
  serviceModule = await import("../addon/chrome/content/DownloadItService.sys.mjs");
} finally {
  if (createdBinaryMetadata) {
    fs.rmSync(binaryMetadataPath);
  }
}
const { DownloadItError, DownloadItService } = serviceModule;

const WINDOWS_PLATFORM = Object.freeze({
  id: "windows",
  flashGotSupported: true,
  processWindowHidingSupported: true,
});
const LINUX_PLATFORM = Object.freeze({
  id: "linux",
  flashGotSupported: false,
  processWindowHidingSupported: false,
});

function createService(platform = "windows") {
  const service = Object.create(DownloadItService.prototype);
  service.platformDefinition = platform === "linux"
    ? LINUX_PLATFORM
    : platform === "windows"
      ? WINDOWS_PLATFORM
      : null;
  service.serviceReady = false;
  return service;
}

function createSettingsService(platform = "windows") {
  const service = createService(platform);
  service.binaryPath = platform === "windows"
    ? "C:\\Profile\\DownloadIt\\FlashGot.exe"
    : "";
  service.profileDirectory = "C:\\Profile\\DownloadIt";
  service.customDownloadersPath =
    "C:\\Profile\\DownloadIt\\custom-downloaders.json";
  service.flashGotManagers = [];
  service.customDownloaderDocument = { version: 1, downloaders: [] };
  service.customDownloaderLoadError = null;
  service.autoCaptureRulesPath =
    "C:\\Profile\\DownloadIt\\auto-capture-rules.json";
  service.autoCaptureRuleDocument = { version: 1, rules: [] };
  service.autoCaptureRulesLoadError = null;
  service.autoCaptureRulesWritePromise = Promise.resolve();
  service.jDownloaderOnline = false;
  service.jDownloaderProbePromise = null;
  service.jDownloaderProbeEndpoint = "";
  service.jDownloaderStartupPromise = null;
  service.mirrorRegistry = service.createMirrorRegistry();
  service.idmBridge = { running: false };
  service.isLocalFile = value => value === "C:\\JD\\JDownloader.exe";
  service.isLocalExecutable = service.isLocalFile;
  service.providers = service.createProviderRegistry();
  return service;
}

function prepareStartupService(service) {
  service.reloadCustomDownloaders = async () => service.readSettings();
  service.reloadAutoCaptureRules = async () => service.readSettings();
  service.registerToolbarWidget = () => {};
  service.unregisterToolbarWidget = () => {};
  service.refreshManagers = async () => service.managers.map(downloader => downloader.name);
  service.syncIDMBridge = () => {};
  service.listCustomDownloaders = () => [];
}

test("platform capabilities initialize Windows and Linux services independently", async () => {
  preferenceValues.clear();
  for (const [os, expected] of [
    ["WINNT", WINDOWS_PLATFORM],
    ["Linux", LINUX_PLATFORM],
  ]) {
    servicesMock.appinfo.OS = os;
    const service = new DownloadItService({ version: "test" });
    prepareStartupService(service);
    let deployCalls = 0;
    service.deployBinary = async () => {
      deployCalls++;
      return "C:\\Profile\\DownloadIt\\FlashGot.exe";
    };

    assert.equal(service.platformDefinition.id, expected.id);
    assert.equal(service.serviceReady, false);
    await service.startup();
    assert.equal(service.serviceReady, true);
    assert.equal(deployCalls, os === "WINNT" ? 1 : 0);
    assert.equal(
      service.binaryPath,
      os === "WINNT" ? "C:\\Profile\\DownloadIt\\FlashGot.exe" : "",
    );
    const snapshot = service.readSettings();
    assert.equal(snapshot.platform, expected.id);
    assert.equal(snapshot.platformSupported, true);
    assert.equal(snapshot.flashGotSupported, expected.flashGotSupported);
    assert.equal(
      snapshot.processWindowHidingSupported,
      expected.processWindowHidingSupported,
    );
    await service.shutdown();
    assert.equal(service.serviceReady, false);
  }

  servicesMock.appinfo.OS = "Darwin";
  const unsupported = new DownloadItService({ version: "test" });
  await assert.rejects(
    unsupported.startup(),
    /supports Windows and Linux only/,
  );
  servicesMock.appinfo.OS = "WINNT";
});

test("Linux hides FlashGot cache and falls back to Firefox without deleting preferences", async () => {
  preferenceValues.clear();
  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "flashgot", id: "Windows Manager" }),
  );
  preferenceValues.set(
    "downloadit.detectedManagers",
    JSON.stringify(["Windows Manager"]),
  );
  const service = createSettingsService("linux");
  service.flashGotManagers = service.loadManagerCache();
  service.providers = service.createProviderRegistry();
  const refreshes = [];
  const originalRefresh = service.providers.refresh.bind(service.providers);
  service.providers.refresh = async (provider, options) => {
    refreshes.push(provider);
    return originalRefresh(provider, options);
  };

  assert.deepEqual(service.listFlashGotDownloaders(), []);
  assert.equal(service.flashGotManagers[0], "Windows Manager");
  assert.equal(
    service.resolveCustomFilePath("C:\\Tools\\curl.exe"),
    "C:\\Tools\\curl.exe",
  );
  assert.equal(
    service.normalizeCustomFilePathForStorage("C:\\Tools\\curl.exe"),
    "C:\\Tools\\curl.exe",
  );
  assert.equal(
    service.normalizeJDownloaderSettings({
      endpoint: "http://127.0.0.1:9666/flashgot",
      launchPath: "C:\\JD\\JDownloader.exe",
      autoLaunch: true,
    }).launchPath,
    "C:\\JD\\JDownloader.exe",
  );
  const foreignJDownloader = service.createJDownloaderDescriptor({
    enabled: true,
    endpoint: "http://127.0.0.1:9666/flashgot",
    launchPath: "C:\\JD\\JDownloader.exe",
    autoLaunch: true,
  });
  assert.equal(foreignJDownloader.available, false);
  assert.equal(foreignJDownloader.unavailableReason, "platform-path");
  assert.deepEqual(service.defaultDownloader.ref, {
    provider: "native",
    id: "firefox",
  });
  assert.deepEqual(
    await service.refreshManagers({ persistDefault: false }),
    ["Firefox"],
  );
  assert.deepEqual(refreshes, []);
  const snapshot = service.readSettings();
  assert.equal(snapshot.detectedManagerCount, 0);
  assert.equal(snapshot.availableManagerCount, 1);
  preferenceValues.set(
    "downloadit.jdownloader.detectedPath",
    "C:\\JD\\JDownloader.jar",
  );
  preferenceValues.set(
    "downloadit.jdownloader.detectedJavaArgs",
    '["-Xmx512m"]',
  );
  assert.equal(service.resolveJDownloaderLaunch({
    launchPath: "",
    detectedPath: "C:\\JD\\JDownloader.jar",
    detectedJavaArgs: ["-Xmx512m"],
  }), null);
  assert.equal(
    preferenceValues.get("downloadit.jdownloader.detectedPath"),
    "C:\\JD\\JDownloader.jar",
  );
  await assert.rejects(
    service.downloadLinks(
      [],
      JSON.stringify({ provider: "flashgot", id: "Windows Manager" }),
    ),
    error => error.code === "flashgot-unsupported-platform",
  );
  assert.equal(
    preferenceValues.get("downloadit.detectedManagers"),
    JSON.stringify(["Windows Manager"]),
  );
  assert.equal(
    preferenceValues.get("downloadit.defaultDM"),
    JSON.stringify({ provider: "flashgot", id: "Windows Manager" }),
  );
  preferenceValues.clear();
});

test("download targets and context URLs use separate policies", async () => {
  const service = createService();
  service.mirrorRegistry = service.createMirrorRegistry();
  const downloads = [];
  service.resolveDownloader = () => ({
    available: true,
    name: "Test downloader",
    ref: { provider: "custom", id: "test" },
    capabilities: {},
  });
  service.providers = {
    async download(...args) {
      downloads.push(args);
    },
  };
  preferenceValues.set("downloadit.omitCookies", true);
  try {
    await service.downloadLinks([
      {
        url: "https://example.com/file.zip",
        filename: "file.zip",
        referer: "https://example.com/releases/addon.xpi",
        downloadPageReferer: "https://example.com/xpinstall/page",
        browser: { browsingContext: { customUserAgent: "Test Agent" } },
      },
      {
        url: "https://example.com/addon.xpi",
        filename: "addon.xpi",
      },
    ], "test");
  } finally {
    preferenceValues.delete("downloadit.omitCookies");
  }

  assert.equal(downloads.length, 1);
  const [, job, contexts] = downloads[0];
  assert.deepEqual(job.links.map(link => link.url), [
    "https://example.com/file.zip",
  ]);
  assert.equal(job.referer, "https://example.com/releases/addon.xpi");
  assert.equal(job.dlpageReferer, "https://example.com/xpinstall/page");
  assert.equal(contexts.length, 1);
});

test("download dispatch rewrites GitHub jobs before every provider", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.omitCookies", true);
  preferenceValues.set("downloadit.mirrors", JSON.stringify({
    version: 1,
    adapters: {
      github: { enabled: true, endpoint: "https://gh-proxy.com/" },
    },
  }));
  const service = createService();
  service.mirrorRegistry = service.createMirrorRegistry();
  const downloader = {
    available: true,
    name: "Test downloader",
    ref: { provider: "custom", id: "test" },
    capabilities: {},
  };
  service.resolveDownloader = () => downloader;
  const downloads = [];
  service.providers = {
    async download(...args) {
      downloads.push(args);
    },
  };

  try {
    await service.downloadLinks([{
      url: "https://github.com/owner/repo/releases/download/v1/app.zip",
      filename: "app.zip",
      browser: { browsingContext: { customUserAgent: "Test Agent" } },
    }], "test");

    const nativeDownloader = service.createNativeDownloaderDescriptor();
    service.resolveDownloader = () => nativeDownloader;
    await service.downloadLinks([{
      url: "https://github.com/owner/repo/archive/refs/heads/main.zip",
      filename: "source.zip",
      browser: { browsingContext: { customUserAgent: "Test Agent" } },
    }], "firefox");

    Object.defineProperty(service, "defaultDownloader", {
      configurable: true,
      value: downloader,
    });
    await service.downloadIDMTask({
      url: "https://raw.githubusercontent.com/owner/repo/main/file.txt",
      filename: "file.txt",
      cookie: "github_session=secret",
    });
  } finally {
    preferenceValues.clear();
  }

  assert.equal(downloads.length, 3);
  assert.equal(downloads[0][0].provider, "custom");
  assert.equal(
    downloads[0][1].links[0].url,
    "https://gh-proxy.com/https://github.com/owner/repo/releases/download/v1/app.zip",
  );
  assert.equal(downloads[1][0].provider, "native");
  assert.equal(
    downloads[1][1].links[0].url,
    "https://gh-proxy.com/https://github.com/owner/repo/archive/refs/heads/main.zip",
  );
  assert.equal(
    downloads[2][1].links[0].url,
    "https://gh-proxy.com/https://raw.githubusercontent.com/owner/repo/main/file.txt",
  );
  assert.equal(downloads[2][1].links[0].cookies, "");
});

test("download launchers prefer a matching original GitHub URI", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.mirrors", JSON.stringify({
    version: 1,
    adapters: {
      github: { enabled: true, endpoint: "https://gh-proxy.com/" },
    },
  }));
  const service = createService();
  service.mirrorRegistry = service.createMirrorRegistry();
  service.getLauncherSourceWindow = () => null;
  service.getBrowserWindow = () => null;
  let submitted;
  service.downloadLink = async context => {
    submitted = context;
  };
  try {
    await service.downloadLauncher({
      launcher: {
        source: { spec: "https://objects.githubusercontent.com/signed/file.zip" },
        channel: {
          originalURI: {
            spec: "https://github.com/owner/repo/releases/download/v1/file.zip",
          },
          loadInfo: {},
        },
        suggestedFileName: "file.zip",
        MIMEInfo: { MIMEType: "application/zip" },
      },
      manager: "test",
    });
  } finally {
    preferenceValues.clear();
  }
  assert.equal(
    submitted.url,
    "https://github.com/owner/repo/releases/download/v1/file.zip",
  );

  await service.downloadLauncher({
    launcher: {
      source: { spec: "https://objects.githubusercontent.com/signed/final.zip" },
      channel: {
        originalURI: { spec: "https://github.com/owner/repo/releases/tag/v1" },
        loadInfo: {},
      },
      suggestedFileName: "final.zip",
      MIMEInfo: { MIMEType: "application/zip" },
    },
    manager: "test",
  });
  assert.equal(
    submitted.url,
    "https://objects.githubusercontent.com/signed/final.zip",
  );
});

test("automatic capture file updates are serialized without losing rules", async () => {
  const service = createSettingsService();
  const writes = [];
  service.writeAutoCaptureRules = async document => {
    writes.push(JSON.parse(JSON.stringify(document)));
  };

  await Promise.all([
    service.setAutoCaptureRule("zip", "allow"),
    service.setAutoCaptureRule("exe", "deny"),
  ]);

  assert.equal(writes.length, 2);
  assert.deepEqual(
    service.autoCaptureRules.rules.map(rule => [
      rule.action,
      rule.match.type,
      rule.match.value,
    ]),
    [
      ["allow", "extension", "zip"],
      ["deny", "extension", "exe"],
    ],
  );
  assert.equal(writes[1].rules.length, 2);
});

test("damaged automatic capture files disable rules until a valid reload", async () => {
  const service = createSettingsService();
  const originalReadUTF8 = ioUtilsMock.readUTF8;
  try {
    ioUtilsMock.readUTF8 = async () => "{invalid";
    let snapshot = await service.reloadAutoCaptureRules();
    assert.deepEqual(service.autoCaptureRules.rules, []);
    assert.ok(snapshot.autoCaptureRulesError);
    assert.equal(service.getAutoCaptureDisposition("zip"), "default");

    ioUtilsMock.readUTF8 = async () => JSON.stringify({
      version: 1,
      rules: [{
        id: "33333333-3333-4333-8333-333333333333",
        action: "allow",
        match: { type: "extension", value: "zip" },
      }],
    });
    snapshot = await service.reloadAutoCaptureRules();
    assert.equal(snapshot.autoCaptureRulesError, null);
    assert.equal(service.getAutoCaptureDisposition("zip"), "allow");
  } finally {
    if (originalReadUTF8) {
      ioUtilsMock.readUTF8 = originalReadUTF8;
    } else {
      delete ioUtilsMock.readUTF8;
    }
  }
});

test("service registers Firefox as the always-available native provider", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");

  assert.match(service, /provider: NATIVE_PROVIDER,[\s\S]*NATIVE_DOWNLOADER_ID/);
  assert.match(service, /name: Services\.appinfo\.name \|\| "Firefox"/);
  assert.match(service, /type: "native"/);
  assert.match(service, /available: true/);
  assert.match(
    service,
    /get downloadDialogManagers\(\)[\s\S]*downloader\.ref\.provider !== NATIVE_PROVIDER/,
  );
});

test("native downloads use Firefox targets, partial files, and the global list", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");

  assert.match(service, /Downloads\.getPreferredDownloadsDirectory\(\)/);
  assert.match(service, /DownloadPaths\.sanitize\(/);
  assert.match(service, /DownloadPaths\.createNiceUniqueFile\(targetTemplate\)/);
  assert.match(service, /const partFilePath = `\$\{targetPath\}\.part`/);
  assert.match(service, /Downloads\.createDownload\(/);
  assert.match(service, /download\.tryToKeepPartialData = true/);
  assert.match(service, /download\.start\(\)/);
  assert.match(service, /Downloads\.getList\(Downloads\.ALL\)/);
  assert.match(service, /await list\.add\(download\)/);
  assert.match(service, /Promise\.allSettled\(/);
  assert.match(service, /native-partial-failure/);
});

test("native sources retain Firefox isolation context and configure POST channels", () => {
  const service = read("addon/chrome/content/DownloadItService.sys.mjs");

  for (const property of [
    "loadingPrincipal",
    "referrerInfo",
    "cookieJarSettings",
    "userContextId",
    "browsingContextId",
  ]) {
    assert.match(service, new RegExp(`source\\.${property}`));
  }
  assert.match(service, /const source = \{ url: link\.url, isPrivate \}/);
  assert.match(service, /source\.adjustChannel = channel =>/);
  assert.match(service, /stream\.setUTF8Data\(postData\)/);
  assert.match(
    service,
    /QueryInterface\(Ci\.nsIUploadChannel2\)\.explicitSetUploadStream\(\s*stream,\s*contentType,\s*-1,\s*"POST",?\s*\)/,
  );
  assert.match(service, /"application\/x-www-form-urlencoded"/);
  assert.doesNotMatch(service, /source\.cookies\s*=/);
});

test("native provider behavior is documented in both languages", () => {
  const englishReadme = read("README.md");
  const chineseReadme = read("README-zh_CN.md");

  for (const source of [englishReadme, chineseReadme]) {
    assert.match(source, /native:firefox/);
    assert.match(source, /\.part/);
    assert.match(source, /name\(1\)\.ext/);
    assert.match(source, /Cookie jar/i);
  }
});

test("native provider follows external providers and is the default fallback", () => {
  preferenceValues.clear();
  const service = createService();
  service.flashGotManagers = ["External Manager"];
  service.customDownloaderDocument = { version: 1, downloaders: [] };
  service.providers = service.createProviderRegistry();

  assert.deepEqual(
    service.managers.map(downloader => downloader.ref),
    [
      { provider: "flashgot", id: "External Manager" },
      { provider: "native", id: "firefox" },
    ],
  );

  service.flashGotManagers = [];
  assert.deepEqual(service.defaultDownloader.ref, {
    provider: "native",
    id: "firefox",
  });
});

test("native POST sources preserve frame isolation context", () => {
  createdStreams.length = 0;
  const principal = { originAttributes: { userContextId: 4 } };
  const cookieJarSettings = { partitionKey: "container-4" };
  const referrerInfo = { originalReferrer: { spec: "https://example.com/frame" } };
  const child = {
    id: 22,
    children: [],
    currentURI: { spec: "https://example.com/frame" },
    currentWindowGlobal: { documentPrincipal: principal, cookieJarSettings },
    originAttributes: { userContextId: 4 },
    usePrivateBrowsing: true,
  };
  const root = { id: 11, children: [child] };
  const service = createService();
  const source = service.createNativeDownloadSource(
    { url: "https://example.com/post", postdata: "query=\u6d4b\u8bd5" },
    {
      browser: { browsingContext: root },
      browsingContextId: 22,
      postContentType: "application/json; charset=UTF-8",
      referrerInfo,
    },
  );

  assert.equal(source.loadingPrincipal, principal);
  assert.equal(source.referrerInfo, referrerInfo);
  assert.equal(source.cookieJarSettings, cookieJarSettings);
  assert.equal(source.userContextId, 4);
  assert.equal(source.browsingContextId, 22);
  assert.equal(source.isPrivate, true);
  assert.equal("cookies" in source, false);

  let uploadArguments;
  const channel = {
    QueryInterface(value) {
      assert.equal(value, interfacesMock.nsIUploadChannel2);
      return this;
    },
    explicitSetUploadStream(...args) {
      uploadArguments = args;
    },
  };
  source.adjustChannel(channel);

  assert.equal(createdStreams.length, 1);
  assert.equal(createdStreams[0].data, "query=\u6d4b\u8bd5");
  assert.deepEqual(uploadArguments, [
    createdStreams[0],
    "application/json; charset=UTF-8",
    -1,
    "POST",
  ]);
});

test("native downloads sanitize unique targets before starting and registering", async () => {
  const events = [];
  const removed = [];
  let createOptions;
  let sanitizedCandidate;
  let uniqueTemplatePath;
  ioUtilsMock.getFile = async directory => ({
    path: directory,
    append(filename) {
      this.path += `\\${filename}`;
    },
  });
  ioUtilsMock.remove = async (target, options) => removed.push([target, options]);
  downloadPathsMock.sanitize = candidate => {
    sanitizedCandidate = candidate;
    return "safe.zip";
  };
  downloadPathsMock.createNiceUniqueFile = template => {
    uniqueTemplatePath = template.path;
    return { path: "C:\\Downloads\\safe(1).zip" };
  };
  const transferPromise = new Promise(() => {});
  const download = {
    start() {
      events.push("start");
      return transferPromise;
    },
  };
  downloadsMock.createDownload = async options => {
    events.push("create");
    createOptions = options;
    return download;
  };
  downloadsMock.getList = async listType => {
    events.push("get-list");
    assert.equal(listType, downloadsMock.ALL);
    return {
      async add(value) {
        events.push("add");
        assert.equal(value, download);
      },
    };
  };

  const service = createService();
  const result = await service.startNativeDownload(
    { url: "https://example.com/unsafe.zip", filename: "unsafe.zip" },
    { referrerInfo: {} },
    "C:\\Downloads",
  );

  assert.equal(result, download);
  assert.equal(sanitizedCandidate, "unsafe.zip");
  assert.equal(uniqueTemplatePath, "C:\\Downloads\\safe.zip");
  assert.equal(createOptions.target.path, "C:\\Downloads\\safe(1).zip");
  assert.equal(createOptions.target.partFilePath, "C:\\Downloads\\safe(1).zip.part");
  assert.equal(createOptions.source.url, "https://example.com/unsafe.zip");
  assert.equal(download.tryToKeepPartialData, true);
  assert.deepEqual(events, ["create", "start", "get-list", "add"]);
  assert.deepEqual(removed, []);
});

test("native batches report partial and complete startup failures", async () => {
  downloadsMock.getPreferredDownloadsDirectory = async () => "C:\\Downloads";
  const service = createService();
  const job = {
    links: [
      { url: "https://example.com/one" },
      { url: "https://example.com/two" },
      { url: "https://example.com/three" },
    ],
  };

  service.startNativeDownload = async link => {
    if (link.url.endsWith("two")) {
      throw new Error("second failed");
    }
    return link.url;
  };
  await assert.rejects(
    service.downloadViaNative("firefox", job, [{}, {}, {}]),
    error => error instanceof DownloadItError &&
      error.code === "native-partial-failure" &&
      error.args.succeeded === 2 &&
      error.args.failed === 1,
  );

  service.startNativeDownload = async () => {
    throw new Error("all failed");
  };
  await assert.rejects(
    service.downloadViaNative("firefox", job, [{}, {}, {}]),
    error => error instanceof DownloadItError &&
      error.code === "native-download-failed" &&
      error.args.error === "all failed",
  );
});

test("JDownloader settings apply normalized values, clear stale discovery, and honor locks", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  preferenceValues.set(
    "downloadit.jdownloader.detectedPath",
    "C:\\Old\\JDownloader.jar",
  );
  preferenceValues.set(
    "downloadit.jdownloader.detectedJavaArgs",
    '["-Xmx512m"]',
  );
  const service = createSettingsService();

  const snapshot = await service.applySettings({
    autoStartTasks: false,
    jdownloader: {
      endpoint: "http://localhost:9777/",
      launchPath: "C:\\JD\\JDownloader.exe",
      autoLaunch: false,
    },
  });

  assert.equal(preferenceValues.get("downloadit.autoStartTasks"), false);
  assert.equal(
    preferenceValues.get("downloadit.jdownloader.endpoint"),
    "http://localhost:9777/flashgot",
  );
  assert.equal(
    preferenceValues.get("downloadit.jdownloader.launchPath"),
    "C:\\JD\\JDownloader.exe",
  );
  assert.equal(preferenceValues.get("downloadit.jdownloader.autoLaunch"), false);
  assert.equal(preferenceValues.has("downloadit.jdownloader.detectedPath"), false);
  assert.equal(
    preferenceValues.has("downloadit.jdownloader.detectedJavaArgs"),
    false,
  );
  assert.equal(snapshot.autoStartTasks, false);
  assert.equal(snapshot.jdownloader.endpoint, "http://localhost:9777/flashgot");
  assert.equal(snapshot.jdownloader.launchPath, "C:\\JD\\JDownloader.exe");
  assert.equal(snapshot.jdownloader.autoLaunch, false);

  preferenceLocks.add("downloadit.autoStartTasks");
  await assert.rejects(
    service.applySettings({ autoStartTasks: true }),
    /task start preference is locked/i,
  );
  assert.equal(service.readSettings().autoStartTasksLocked, true);
  preferenceLocks.clear();

  preferenceLocks.add("downloadit.jdownloader.endpoint");
  assert.equal(service.readSettings().jdownloaderLocked.endpoint, true);
  await assert.rejects(
    service.applySettings({
      jdownloader: {
        endpoint: "http://localhost:9888/flashgot",
        launchPath: "C:\\JD\\JDownloader.exe",
        autoLaunch: false,
      },
    }),
    /JDownloader endpoint preference is locked/i,
  );
  preferenceLocks.clear();
});

test("built-in protocol settings use a UI view while persisting through provider prefs", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();
  const initial = service.readSettings();

  assert.deepEqual(initial.builtInProtocols.map(protocol => ({
    id: protocol.id,
    ref: protocol.ref,
    singleton: protocol.singleton,
  })), [{
    id: "jdownloader",
    ref: { provider: "jdownloader", id: "jdownloader" },
    singleton: true,
  }]);
  assert.equal(initial.builtInProtocols[0].settings.enabled, false);
  assert.equal(service.listJDownloaderDownloaders().length, 0);

  const snapshot = await service.applySettings({
    builtInProtocols: {
      jdownloader: {
        enabled: true,
        endpoint: "http://localhost:9666/flashgot",
        launchPath: "C:\\JD\\JDownloader.exe",
        autoLaunch: false,
      },
    },
  });

  assert.equal(
    preferenceValues.get("downloadit.jdownloader.enabled"),
    true,
  );
  assert.equal(
    preferenceValues.get("downloadit.jdownloader.endpoint"),
    "http://localhost:9666/flashgot",
  );
  assert.equal(snapshot.builtInProtocols[0].settings.autoLaunch, false);
  assert.equal(snapshot.builtInProtocols[0].settings.enabled, true);
  assert.equal(service.listJDownloaderDownloaders().length, 1);
  assert.equal(snapshot.customDownloaders.downloaders.length, 0);
  service.flashGotManagers = ["External"];
  assert.equal(service.readSettings().detectedManagerCount, 1);
});

test("developer mode is hidden by default, persists activation, and honors locks", () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();

  try {
    assert.equal(service.readSettings().developerMode, false);
    assert.equal(service.activateDeveloperMode(), true);
    assert.equal(preferenceValues.get("downloadit.developerMode"), true);
    assert.equal(service.readSettings().developerMode, true);

    preferenceValues.delete("downloadit.developerMode");
    preferenceLocks.add("downloadit.developerMode");
    assert.equal(service.activateDeveloperMode(), false);
    assert.equal(preferenceValues.has("downloadit.developerMode"), false);
  } finally {
    preferenceValues.clear();
    preferenceLocks.clear();
  }
});

test("mirror settings persist normalized values, fall back safely, and honor locks", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();
  const defaults = service.readSettings();

  assert.deepEqual(defaults.mirrorSettings, {
    version: 1,
    adapters: {
      github: { enabled: false, endpoint: "https://gh-proxy.com/" },
    },
  });
  assert.equal(defaults.mirrorSettingsLocked, false);

  const snapshot = await service.applySettings({
    mirrorSettings: {
      version: 1,
      adapters: {
        github: { enabled: true, endpoint: "https://mirror.example/base" },
      },
    },
  });
  assert.deepEqual(snapshot.mirrorSettings.adapters.github, {
    enabled: true,
    endpoint: "https://mirror.example/base/",
  });
  assert.deepEqual(
    JSON.parse(preferenceValues.get("downloadit.mirrors")),
    snapshot.mirrorSettings,
  );

  const invalidPreference = '{"version":2,"adapters":{}}';
  preferenceValues.set("downloadit.mirrors", invalidPreference);
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(service.readSettings().mirrorSettings, defaults.mirrorSettings);
    await service.applySettings({});
    assert.equal(preferenceValues.get("downloadit.mirrors"), invalidPreference);
  } finally {
    console.error = originalConsoleError;
  }

  preferenceValues.set("downloadit.mirrors", JSON.stringify(snapshot.mirrorSettings));
  preferenceLocks.add("downloadit.mirrors");
  assert.equal(service.readSettings().mirrorSettingsLocked, true);
  await assert.rejects(
    service.applySettings({
      mirrorSettings: {
        version: 1,
        adapters: {
          github: { enabled: false, endpoint: "https://gh-proxy.com/" },
        },
      },
    }),
    /mirror preference is locked/i,
  );
  preferenceValues.clear();
  preferenceLocks.clear();
});

test("JDownloader legacy settings migrate to enabled until explicitly disabled", () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();

  assert.equal(service.getJDownloaderSettings().enabled, false);
  preferenceValues.set(
    "downloadit.jdownloader.endpoint",
    "http://localhost:9777/flashgot",
  );
  assert.equal(service.getJDownloaderSettings().enabled, true);
  preferenceValues.set("downloadit.jdownloader.enabled", false);
  assert.equal(service.getJDownloaderSettings().enabled, false);

  preferenceValues.clear();
  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "jdownloader", id: "jdownloader" }),
  );
  assert.equal(service.getJDownloaderSettings().enabled, true);
});

test("removing JDownloader clears its configuration and replaces its default", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  preferenceValues.set("downloadit.jdownloader.enabled", true);
  preferenceValues.set(
    "downloadit.jdownloader.endpoint",
    "https://example.com/not-loopback",
  );
  preferenceValues.set(
    "downloadit.jdownloader.launchPath",
    "C:\\Missing\\JDownloader.exe",
  );
  preferenceValues.set("downloadit.jdownloader.autoLaunch", false);
  preferenceValues.set(
    "downloadit.jdownloader.detectedPath",
    "C:\\JD\\JDownloader.jar",
  );
  preferenceValues.set(
    "downloadit.jdownloader.detectedJavaArgs",
    '["-Xmx512m"]',
  );
  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "jdownloader", id: "jdownloader" }),
  );
  const service = createSettingsService();
  service.jDownloaderOnline = true;

  const snapshot = await service.applySettings({
    builtInProtocols: {
      jdownloader: {
        enabled: false,
      },
    },
  });

  assert.equal(preferenceValues.get("downloadit.jdownloader.enabled"), false);
  for (const preference of [
    "downloadit.jdownloader.endpoint",
    "downloadit.jdownloader.launchPath",
    "downloadit.jdownloader.autoLaunch",
    "downloadit.jdownloader.detectedPath",
    "downloadit.jdownloader.detectedJavaArgs",
  ]) {
    assert.equal(preferenceValues.has(preference), false);
  }
  assert.deepEqual(snapshot.defaultDownloader.ref, {
    provider: "native",
    id: "firefox",
  });
  assert.equal(snapshot.builtInProtocols[0].settings.enabled, false);
  assert.equal(service.listJDownloaderDownloaders().length, 0);
  assert.equal(service.jDownloaderOnline, false);
});

test("manager refresh skips disabled built-in protocols", async () => {
  preferenceValues.clear();
  const service = createService();
  const refreshes = [];
  service.providers = {
    async refresh(provider) {
      refreshes.push(provider);
    },
    listDownloaders() {
      return [
        {
          ref: { provider: "jdownloader", id: "jdownloader" },
          name: "JDownloader",
          custom: false,
          available: true,
        },
        {
          ref: { provider: "flashgot", id: "External" },
          name: "External",
          custom: false,
          available: true,
        },
        {
          ref: { provider: "custom", id: "custom" },
          name: "Custom",
          custom: true,
          available: true,
        },
        {
          ref: { provider: "native", id: "firefox" },
          name: "Firefox",
          custom: false,
          available: true,
        },
      ];
    },
  };

  assert.deepEqual(
    await service.refreshManagers({ persistDefault: false }),
    ["JDownloader", "External", "Custom", "Firefox"],
  );
  assert.deepEqual(refreshes, ["flashgot"]);
});

test("manager refresh probes enabled built-ins without waiting or failing FlashGot", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.jdownloader.enabled", true);
  const service = createService();
  const refreshes = [];
  let rejectJDownloader;
  const jDownloaderRefresh = new Promise((_resolve, reject) => {
    rejectJDownloader = reject;
  });
  service.providers = {
    refresh(provider) {
      refreshes.push(provider);
      return provider === "jdownloader" ? jDownloaderRefresh : Promise.resolve();
    },
    listDownloaders() {
      return [{
        ref: { provider: "flashgot", id: "External" },
        name: "External",
        custom: false,
        available: true,
      }];
    },
  };

  const managerRefresh = service.refreshManagers({ persistDefault: false });
  const builtInRefresh = service.builtInRefreshPromise;
  assert.ok(builtInRefresh);
  assert.deepEqual(await managerRefresh, ["External"]);
  assert.deepEqual(refreshes, ["jdownloader", "flashgot"]);
  assert.equal(service.builtInRefreshPromise, builtInRefresh);

  rejectJDownloader(new Error("offline"));
  const results = await builtInRefresh;
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason.message, "offline");
  assert.equal(service.builtInRefreshPromise, null);
});

test("JDownloader launch resolution prioritizes manual paths and safe Java candidates", () => {
  environmentValues.clear();
  environmentValues.set("JAVA_HOME", "C:\\Java");
  const service = createService();
  const siblingFiles = new Set(["JDownloader2.exe"]);
  service.getLocalFile = jarPath => ({
    path: jarPath,
    leafName: "JDownloader.jar",
    parent: {
      path: "C:\\JD",
      clone() {
        return {
          path: this.path,
          leafName: "",
          append(name) {
            this.leafName = name;
            this.path += `\\${name}`;
          },
          exists() {
            return siblingFiles.has(this.leafName);
          },
          isFile() {
            return this.exists();
          },
        };
      },
    },
  });
  service.existingLocalPath = value => value === "C:\\JD\\JDownloader.jar"
    ? value
    : "";
  service.existingExecutablePath = value =>
    value === "C:\\JD\\JDownloader2.exe" ? value : "";
  service.readRegisteredJavaHomes = () => ["C:\\RegisteredJava"];

  assert.deepEqual(service.resolveJDownloaderLaunch({
    launchPath: "C:\\JD\\JDownloader.jar",
    detectedPath: "C:\\Cache\\Fallback.jar",
    detectedJavaArgs: ["-Xmx512m"],
  }), {
    executablePath: "C:\\JD\\JDownloader2.exe",
    argumentsList: [],
  });

  siblingFiles.clear();
  const candidates = [];
  service.existingExecutablePath = value => {
    candidates.push(value);
    return value === "C:\\Java\\bin\\javaw.exe" ? value : "";
  };
  assert.deepEqual(service.resolveJDownloaderLaunch({
    launchPath: "C:\\JD\\JDownloader.jar",
    detectedPath: "",
    detectedJavaArgs: ["-Xmx512m"],
  }), {
    executablePath: "C:\\Java\\bin\\javaw.exe",
    argumentsList: ["-Xmx512m", "-jar", "C:\\JD\\JDownloader.jar"],
  });
  assert.ok(
    candidates.indexOf("C:\\JD\\runtime\\jre\\bin\\java.exe") <
      candidates.indexOf("C:\\Java\\bin\\javaw.exe"),
  );

  service.existingExecutablePath = () => "";
  assert.throws(
    () => service.resolveJDownloaderLaunch({
      launchPath: "C:\\Missing\\JDownloader.exe",
      detectedPath: "C:\\Cache\\JDownloader.exe",
      detectedJavaArgs: [],
    }),
    error => error.code === "jdownloader-launch-path-invalid",
  );
});

test("Linux resolves JDownloader launchers and Java in documented priority order", () => {
  environmentValues.clear();
  environmentValues.set("JAVA_HOME", "/opt/java");
  environmentValues.set("PATH", "/home/test/bin:/custom/java/bin");
  const service = createService("linux");
  service.getLocalFile = jarPath => ({
    path: jarPath,
    leafName: "JDownloader.jar",
    parent: {
      path: "/opt/JDownloader With Space",
      clone() {
        return {
          path: this.path,
          append(name) {
            this.path += `/${name}`;
          },
        };
      },
    },
  });
  service.existingLocalPath = value =>
    value === "/opt/JDownloader With Space/JDownloader.jar" ? value : "";

  service.existingExecutablePath = value =>
    value === "/opt/JDownloader With Space/JDownloader2" ? value : "";
  assert.deepEqual(service.resolveJDownloaderLaunch({
    launchPath: "/opt/JDownloader With Space/JDownloader.jar",
    detectedPath: "",
    detectedJavaArgs: ["-Xms64m", "-Xmx1G"],
  }), {
    executablePath: "/opt/JDownloader With Space/JDownloader2",
    argumentsList: [],
  });

  const bundledCandidates = [];
  service.existingExecutablePath = value => {
    bundledCandidates.push(value);
    return value === "/opt/JDownloader With Space/runtime/bin/java" ? value : "";
  };
  assert.deepEqual(service.resolveJDownloaderLaunch({
    launchPath: "/opt/JDownloader With Space/JDownloader.jar",
    detectedPath: "",
    detectedJavaArgs: ["-Xmx1G"],
  }), {
    executablePath: "/opt/JDownloader With Space/runtime/bin/java",
    argumentsList: [
      "-Xmx1G",
      "-jar",
      "/opt/JDownloader With Space/JDownloader.jar",
    ],
  });
  assert.ok(
    bundledCandidates.indexOf("/opt/JDownloader With Space/jre/bin/java") <
      bundledCandidates.indexOf("/opt/JDownloader With Space/runtime/bin/java"),
  );
  assert.equal(bundledCandidates.includes("/opt/java/bin/java"), false);

  const javaCandidates = [];
  service.existingExecutablePath = value => {
    javaCandidates.push(value);
    return value === "/opt/java/bin/java" ? value : "";
  };
  assert.equal(
    service.resolveJDownloaderLaunch({
      launchPath: "/opt/JDownloader With Space/JDownloader.jar",
      detectedPath: "",
      detectedJavaArgs: [],
    }).executablePath,
    "/opt/java/bin/java",
  );
  assert.equal(javaCandidates.includes("/home/test/bin/java"), false);

  environmentValues.delete("JAVA_HOME");
  const pathCandidates = [];
  service.existingExecutablePath = value => {
    pathCandidates.push(value);
    return value === "/custom/java/bin/java" ? value : "";
  };
  assert.equal(
    service.resolveJDownloaderLaunch({
      launchPath: "/opt/JDownloader With Space/JDownloader.jar",
      detectedPath: "",
      detectedJavaArgs: [],
    }).executablePath,
    "/custom/java/bin/java",
  );
  assert.equal(pathCandidates.includes("/usr/bin/java"), false);
  assert.equal(pathCandidates.includes("/usr/local/bin/java"), false);

  service.existingExecutablePath = value =>
    value === "/opt/JDownloader With Space/JDownloader" ? value : "";
  assert.deepEqual(service.resolveJDownloaderLaunch({
    launchPath: "/opt/JDownloader With Space/JDownloader",
    detectedPath: "",
    detectedJavaArgs: [],
  }), {
    executablePath: "/opt/JDownloader With Space/JDownloader",
    argumentsList: [],
  });
  environmentValues.clear();
});

test("Linux requires execute permission and does not assign startHidden", () => {
  let executable = false;
  let hiddenAssignments = 0;
  localFileFactory = () => ({
    initWithPath(path) {
      this.path = path;
    },
    exists: () => true,
    isFile: () => true,
    isExecutable: () => executable,
  });
  processFactory = () => ({
    init() {},
    set startHidden(value) {
      hiddenAssignments++;
      this.hidden = value;
    },
    runwAsync() {},
  });

  try {
    const linux = createService("linux");
    assert.equal(linux.isLocalExecutable("/usr/bin/curl"), false);
    assert.throws(
      () => linux.startDetachedProcess("/usr/bin/curl", []),
      /Executable not found/,
    );
    executable = true;
    assert.equal(linux.isLocalExecutable("/usr/bin/curl"), true);
    linux.startDetachedProcess("/usr/bin/curl", ["--version"], null, true);
    assert.equal(hiddenAssignments, 0);

    const windows = createService("windows");
    executable = false;
    assert.equal(windows.isLocalExecutable("C:\\Tools\\curl.exe"), true);
    windows.startDetachedProcess("C:\\Tools\\curl.exe", [], null, false);
    assert.equal(hiddenAssignments, 1);
  } finally {
    localFileFactory = () => ({});
    processFactory = () => ({});
  }
});

test("temporary command files follow platform line endings while headers use CRLF", async () => {
  const writes = [];
  ioUtilsMock.writeUTF8 = async (path, value) => writes.push({ path, value });
  downloadsMock.getPreferredDownloadsDirectory = async () => "/downloads";
  const job = {
    referer: "https://example.com/page",
    useragent: "Firefox Test",
    links: [
      { url: "https://example.com/a", filename: "a", desc: "", cookies: "" },
      { url: "https://example.com/b", filename: "b", desc: "", cookies: "" },
    ],
  };

  try {
    for (const [platform, expected] of [
      ["windows", "https://example.com/a\r\nhttps://example.com/b\r\n"],
      ["linux", "https://example.com/a\nhttps://example.com/b\n"],
    ]) {
      writes.length = 0;
      const service = createService(platform);
      service.createTemporaryPath = prefix => `/tmp/${prefix}.txt`;
      service.launchCustomProcesses = async () => {};
      await service.downloadViaCommand({
        command: {
          executablePath: platform === "linux" ? "/usr/bin/curl" : "C:\\curl.exe",
          argumentsTemplate: "[UFILE]",
        },
        startHidden: true,
      }, job);
      assert.equal(writes[0].value, expected);

      const cookieFile = service.buildNetscapeCookieFile([{
        cookieRecords: [{
          host: ".example.com",
          path: "/",
          name: "session",
          value: "test",
          isDomain: true,
          isSecure: true,
          isHttpOnly: false,
          expires: 123,
        }],
      }]);
      assert.equal(cookieFile.includes("\r\n"), platform === "windows");
      assert.equal(cookieFile.endsWith(platform === "linux" ? "\n" : "\r\n"), true);
      assert.equal(
        service.buildHeaderBlock({ cookies: "a=b" }, job),
        "User-Agent: Firefox Test\r\nReferer: https://example.com/page\r\nCookie: a=b",
      );
    }
  } finally {
    delete ioUtilsMock.writeUTF8;
    delete downloadsMock.getPreferredDownloadsDirectory;
  }
});

test("JDownloader startup is shared, retries six times, and reports timeout", async () => {
  const settings = {
    endpoint: "http://127.0.0.1:9666/flashgot",
    autoLaunch: true,
  };
  const shared = createService();
  shared.jDownloaderStartupPromise = null;
  shared.resolveJDownloaderLaunch = () => ({
    executablePath: "C:\\JD\\JDownloader.exe",
    argumentsList: [],
  });
  let launchCount = 0;
  shared.startDetachedProcess = () => {
    launchCount++;
  };
  shared.probeJDownloader = async () => true;
  let releaseDelay;
  const delay = () => new Promise(resolve => {
    releaseDelay = resolve;
  });

  const first = shared.ensureJDownloaderRunning(settings, { delay });
  const second = shared.ensureJDownloaderRunning(settings, { delay });
  assert.equal(launchCount, 1);
  releaseDelay();
  await Promise.all([first, second]);
  assert.equal(shared.jDownloaderStartupPromise, null);

  const timeout = createService();
  timeout.jDownloaderStartupPromise = null;
  timeout.resolveJDownloaderLaunch = shared.resolveJDownloaderLaunch;
  timeout.startDetachedProcess = shared.startDetachedProcess;
  let probeCount = 0;
  timeout.probeJDownloader = async () => {
    probeCount++;
    throw new DownloadItError("jdownloader-unavailable");
  };
  const delays = [];
  await assert.rejects(
    timeout.ensureJDownloaderRunning(settings, {
      delay: async milliseconds => delays.push(milliseconds),
    }),
    error => error.code === "jdownloader-start-timeout",
  );
  assert.equal(probeCount, 6);
  assert.deepEqual(delays, Array(6).fill(8000));
});

test("JDownloader submission probes before one POST and task-start only affects capable providers", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.autoStartTasks", false);
  downloadsMock.getPreferredDownloadsDirectory = async () => "D:\\Downloads";
  const service = createService();
  service.getJDownloaderSettings = () => ({
    endpoint: "http://127.0.0.1:9666/flashgot",
    launchPath: "C:\\JD\\JDownloader.exe",
    autoLaunch: true,
    detectedPath: "",
    detectedJavaArgs: [],
  });
  service.normalizeJDownloaderSettings = value => ({
    endpoint: value.endpoint,
    launchPath: value.launchPath,
    autoLaunch: value.autoLaunch,
  });
  let probeCount = 0;
  service.probeJDownloader = async () => {
    probeCount++;
    throw new DownloadItError("jdownloader-unavailable");
  };
  let startupCount = 0;
  service.ensureJDownloaderRunning = async () => {
    startupCount++;
  };
  const requests = [];
  service.sendJDownloaderRequest = async (...args) => {
    requests.push(args);
    return { status: 200, text: "" };
  };
  const job = {
    referer: "https://example.com/page",
    links: [{
      url: "https://example.com/file.zip",
      desc: "File",
      filename: "file.zip",
      cookies: "session=1",
      postdata: "",
    }],
  };

  assert.deepEqual(
    await service.downloadViaJDownloader("jdownloader", job, {
      autoStartTask: false,
    }),
    { succeeded: 1, failed: 0 },
  );
  assert.equal(probeCount, 1);
  assert.equal(startupCount, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "POST");
  const params = new URLSearchParams(requests[0][2]);
  assert.equal(params.get("autostart"), "0");
  assert.equal(params.get("dir"), "D:\\Downloads");

  assert.deepEqual(
    service.getProviderDownloadOptions({ capabilities: { taskStart: true } }),
    { autoStartTask: false },
  );
  assert.deepEqual(
    service.getProviderDownloadOptions({ capabilities: { taskStart: false } }),
    { autoStartTask: true },
  );
});

test("JDownloader requests set Referer through nsIReferrerInfo", async () => {
  const listeners = new Map();
  const requestHeaders = new Map();
  const channel = {
    loadFlags: 0,
    loadInfo: {
      allowDeprecatedSystemRequests: false,
      httpsOnlyStatus: 0,
    },
    redirectionLimit: 1,
    allowSTS: true,
    QueryInterface(interfaceId) {
      assert.equal(interfaceId, interfacesMock.nsIHttpChannel);
      return this;
    },
    setTRRMode(mode) {
      this.trrMode = mode;
    },
    setNewReferrerInfo(value, policy, sendReferrer) {
      this.newReferrerInfo = { value, policy, sendReferrer };
    },
    setRequestHeader(name) {
      if (name.toLowerCase() === "referer") {
        throw new Error("Referer is a restricted header");
      }
    },
  };
  xmlHttpRequestFactory = () => ({
    channel,
    responseText: "ready",
    status: 200,
    open(method, endpoint, asynchronous) {
      assert.equal(method, "POST");
      assert.equal(endpoint, "http://127.0.0.1:9666/flashgot");
      assert.equal(asynchronous, true);
    },
    setRequestHeader(name, value) {
      requestHeaders.set(name, value);
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    send(body) {
      assert.equal(body, "urls=https%3A%2F%2Fexample.com%2Ffile.zip");
      listeners.get("load")();
    },
  });

  try {
    const service = createService();
    const response = await service.sendJDownloaderRequest(
      "POST",
      "http://127.0.0.1:9666/flashgot",
      "urls=https%3A%2F%2Fexample.com%2Ffile.zip",
    );
    assert.deepEqual(response, { status: 200, text: "ready" });
    assert.equal(channel.loadFlags, 15);
    assert.equal(channel.trrMode, interfacesMock.nsIRequest.TRR_DISABLED_MODE);
    assert.equal(
      channel.loadInfo.httpsOnlyStatus,
      interfacesMock.nsILoadInfo.HTTPS_ONLY_EXEMPT,
    );
    assert.equal(channel.loadInfo.allowDeprecatedSystemRequests, true);
    assert.equal(channel.redirectionLimit, 0);
    assert.equal(channel.allowSTS, false);
    assert.deepEqual(channel.newReferrerInfo, {
      value: "http://localhost:9666/flashgot",
      policy: interfacesMock.nsIReferrerInfo.UNSAFE_URL,
      sendReferrer: true,
    });
    assert.equal(
      requestHeaders.get("Content-Type"),
      "application/x-www-form-urlencoded; charset=UTF-8",
    );
  } finally {
    xmlHttpRequestFactory = () => ({});
  }
});

test("JDownloader draft tests and stale or disabled probes have no persistent side effects", async () => {
  const service = createService();
  let probeOptions;
  service.probeJDownloader = async options => {
    probeOptions = options;
    return { path: "C:\\JD\\JDownloader.jar", javaArguments: ["-Xmx512m"] };
  };
  await service.testJDownloaderConfiguration({
    endpoint: "http://localhost:9666/flashgot",
  });
  assert.deepEqual(probeOptions, {
    endpoint: "http://localhost:9666/flashgot",
    persist: false,
    updateState: false,
  });

  service.probeJDownloader = DownloadItService.prototype.probeJDownloader;
  let enabled = true;
  let configuredEndpoint = "http://127.0.0.1:9666/flashgot";
  service.getJDownloaderSettings = () => ({ enabled, endpoint: configuredEndpoint });
  service.jDownloaderOnline = false;
  service.jDownloaderProbePromise = null;
  service.jDownloaderProbeEndpoint = "";
  let finishRequest;
  service.sendJDownloaderRequest = () => new Promise(resolve => {
    finishRequest = resolve;
  });
  service.existingLocalPath = value => value;
  let storedDiscovery = null;
  service.storeJDownloaderDiscovery = value => {
    storedDiscovery = value;
  };
  const pending = service.probeJDownloader();
  enabled = false;
  finishRequest({
    status: 200,
    text: "C:\\JD\\JDownloader.jar\njava -Xmx512m -jar C:\\JD\\JDownloader.jar",
  });
  await pending;
  assert.equal(storedDiscovery, null);
  assert.equal(service.jDownloaderOnline, false);
  assert.equal(service.jDownloaderProbePromise, null);

  enabled = true;
  configuredEndpoint = "http://127.0.0.1:9666/flashgot";
  const staleEndpoint = service.probeJDownloader();
  configuredEndpoint = "http://localhost:9777/flashgot";
  finishRequest({
    status: 200,
    text: "C:\\JD\\JDownloader.jar\njava -Xmx512m -jar C:\\JD\\JDownloader.jar",
  });
  await staleEndpoint;
  assert.equal(storedDiscovery, null);
  assert.equal(service.jDownloaderOnline, false);
  assert.equal(service.jDownloaderProbePromise, null);
});
