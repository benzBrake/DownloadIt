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
};

globalThis.Components = {
  classes: new Proxy({}, {
    get(_target, contract) {
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
  isAbsolute: value => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(value),
  join: (...parts) => parts.join("\\"),
};
globalThis.ChromeUtils = {
  generateQI: () => function () { return this; },
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

function createService() {
  return Object.create(DownloadItService.prototype);
}

function createSettingsService() {
  const service = createService();
  service.binaryPath = "C:\\Profile\\DownloadIt\\FlashGot.exe";
  service.profileDirectory = "C:\\Profile\\DownloadIt";
  service.customDownloadersPath =
    "C:\\Profile\\DownloadIt\\custom-downloaders.json";
  service.flashGotManagers = [];
  service.customDownloaderDocument = { version: 1, downloaders: [] };
  service.customDownloaderLoadError = null;
  service.jDownloaderOnline = false;
  service.jDownloaderProbePromise = null;
  service.jDownloaderProbeEndpoint = "";
  service.jDownloaderStartupPromise = null;
  service.idmBridge = { running: false };
  service.isLocalFile = value => value === "C:\\JD\\JDownloader.exe";
  service.providers = service.createProviderRegistry();
  return service;
}

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

  const snapshot = await service.applySettings({
    builtInProtocols: {
      jdownloader: {
        endpoint: "http://localhost:9666/flashgot",
        launchPath: "C:\\JD\\JDownloader.exe",
        autoLaunch: false,
      },
    },
  });

  assert.equal(
    preferenceValues.get("downloadit.jdownloader.endpoint"),
    "http://localhost:9666/flashgot",
  );
  assert.equal(snapshot.builtInProtocols[0].settings.autoLaunch, false);
  assert.equal(snapshot.customDownloaders.downloaders.length, 0);
});

test("manager refresh counts available JDownloader and FlashGot providers", async () => {
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
    ["JDownloader", "External"],
  );
  assert.deepEqual(refreshes, ["jdownloader", "flashgot"]);
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
  service.existingLocalPath = value => {
    candidates.push(value);
    if (value === "C:\\JD\\JDownloader.jar") {
      return value;
    }
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

  service.existingLocalPath = () => "";
  assert.throws(
    () => service.resolveJDownloaderLaunch({
      launchPath: "C:\\Missing\\JDownloader.exe",
      detectedPath: "C:\\Cache\\JDownloader.exe",
      detectedJavaArgs: [],
    }),
    error => error.code === "jdownloader-launch-path-invalid",
  );
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

test("JDownloader draft tests and stale endpoint probes have no persistent side effects", async () => {
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
  let configuredEndpoint = "http://127.0.0.1:9666/flashgot";
  service.getJDownloaderSettings = () => ({ endpoint: configuredEndpoint });
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
  configuredEndpoint = "http://localhost:9777/flashgot";
  finishRequest({
    status: 200,
    text: "C:\\JD\\JDownloader.jar\njava -Xmx512m -jar C:\\JD\\JDownloader.jar",
  });
  await pending;
  assert.equal(storedDiscovery, null);
  assert.equal(service.jDownloaderOnline, false);
  assert.equal(service.jDownloaderProbePromise, null);
});
