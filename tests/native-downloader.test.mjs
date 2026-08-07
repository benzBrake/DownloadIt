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
  appinfo: { name: "Firefox", OS: "WINNT", XPCOMABI: "x86_64-msvc-x64" },
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
    getIntPref: (name, fallback) => preferenceValues.get(name) ?? fallback,
    getStringPref: (name, fallback) => preferenceValues.get(name) ?? fallback,
    prefHasUserValue: name => preferenceValues.has(name),
    prefIsLocked: name => preferenceLocks.has(name),
    setBoolPref: (name, value) => preferenceValues.set(name, value),
    setIntPref: (name, value) => preferenceValues.set(name, value),
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
    [
      "export const BINARY_SIZE = 0;",
      "export const BINARY_SHA256 = \"\";",
      "export const ARIA2NEXT_BINARY_METADATA = Object.freeze({",
      "  windows: Object.freeze({ resourceName: \"aria2-next.exe\", profileName: \"aria2-next.exe\", size: 4555264, sha256: \"554f2f81ca53731dc9e01710cfb16081a34759f3276ff16eb4b12656c1b6e5b9\" }),",
      "  \"linux-x86_64\": Object.freeze({ resourceName: \"aria2-next-linux-x86_64\", profileName: \"aria2-next\", size: 3852672, sha256: \"b6f2cdadcd34ba16dd7fcb29de4b84c36f893f9b223a9a05157d1892687a45a0\" }),",
      "});",
      "",
    ].join("\n"),
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
  service.aria2NextStartupPromise = null;
  service.aria2NextStartupSettings = null;
  service.aria2NextProcess = null;
  service.aria2NextOnline = false;
  service.abdmOnline = false;
  service.abdmProbePromise = null;
  service.abdmProbeEndpoint = "";
  service.abdmProbeApiKey = "";
  service.abdmStartupPromise = null;
  service.xdmOnline = false;
  service.xdmProbePromise = null;
  service.xdmStartupPromise = null;
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
    servicesMock.appinfo.XPCOMABI = os === "WINNT"
      ? "x86_64-msvc-x64"
      : "x86_64-gcc3";
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
  servicesMock.appinfo.XPCOMABI = "x86_64-msvc-x64";
});

test("Aria2Next selects the bundled binary by platform and Linux ABI", () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);

  servicesMock.appinfo.OS = "WINNT";
  servicesMock.appinfo.XPCOMABI = "x86_64-msvc-x64";
  const windows = createSettingsService("windows");
  windows.aria2NextOnline = true;
  assert.deepEqual(windows.getAria2NextBinaryDefinition(), {
    resourceName: "aria2-next.exe",
    profileName: "aria2-next.exe",
    size: 4555264,
    sha256: "554f2f81ca53731dc9e01710cfb16081a34759f3276ff16eb4b12656c1b6e5b9",
  });
  assert.equal(windows.readSettings().aria2NextSupported, true);
  assert.equal(windows.createAria2NextDescriptor().available, true);

  servicesMock.appinfo.OS = "Linux";
  servicesMock.appinfo.XPCOMABI = "x86_64-gcc3";
  const linux = createSettingsService("linux");
  linux.aria2NextOnline = true;
  assert.equal(
    linux.getAria2NextBinaryDefinition().resourceName,
    "aria2-next-linux-x86_64",
  );
  assert.equal(linux.getAria2NextBinaryDefinition().profileName, "aria2-next");
  assert.equal(linux.readSettings().aria2NextSupported, true);

  servicesMock.appinfo.XPCOMABI = "aarch64-gcc3";
  const unsupported = createSettingsService("linux");
  assert.equal(unsupported.getAria2NextBinaryDefinition(), null);
  assert.equal(unsupported.readSettings().aria2NextSupported, false);
  assert.equal(unsupported.createAria2NextDescriptor().available, false);
  assert.equal(
    unsupported.createAria2NextDescriptor().unavailableReason,
    "aria2next-platform-unsupported",
  );

  servicesMock.appinfo.OS = "WINNT";
  servicesMock.appinfo.XPCOMABI = "x86_64-msvc-x64";
  preferenceValues.clear();
});

test("unsupported Linux ABI rejects Aria2Next enablement but permits disabling", async () => {
  preferenceValues.clear();
  servicesMock.appinfo.OS = "Linux";
  servicesMock.appinfo.XPCOMABI = "aarch64-gcc3";
  const service = createSettingsService("linux");

  await assert.rejects(
    service.applySettings({
      aria2next: { enabled: true, rpcPort: 6800 },
    }),
    error => error.code === "aria2next-platform-unsupported",
  );

  preferenceValues.set("downloadit.aria2next.enabled", true);
  await service.applySettings({ aria2next: { enabled: false } });
  assert.equal(
    preferenceValues.get("downloadit.aria2next.enabled"),
    false,
  );

  servicesMock.appinfo.OS = "WINNT";
  servicesMock.appinfo.XPCOMABI = "x86_64-msvc-x64";
  preferenceValues.clear();
});

test("removing Aria2Next shuts down only its managed process", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.rpcPort", 6801);
  preferenceValues.set("downloadit.aria2next.secret", "remove-secret");
  const service = createSettingsService();
  let killed = 0;
  const process = { isRunning: false, kill() { killed++; } };
  service.aria2NextProcess = process;
  let request = null;
  service.sendAria2Request = async (config, payload) => {
    request = { config, payload };
    return { result: "OK" };
  };

  await service.applySettings({ aria2next: { enabled: false } });

  assert.equal(request.config.rpcUrl, "http://127.0.0.1:6801/jsonrpc");
  assert.equal(request.payload.method, "aria2.shutdown");
  assert.deepEqual(request.payload.params, ["token:remove-secret"]);
  assert.equal(killed, 0);
  assert.equal(service.aria2NextProcess, null);
  preferenceValues.clear();
});

test("removing Aria2Next after Firefox restart shuts it down without a process handle", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.rpcPort", 6802);
  preferenceValues.set("downloadit.aria2next.secret", "stale-process-secret");
  // exitOnClose is intentionally false: the previous Firefox session left
  // Aria2Next running, so this service instance has no process handle.
  const service = createSettingsService();
  let request = null;
  service.sendAria2Request = async (config, payload) => {
    request = { config, payload };
    return { result: "OK" };
  };

  await service.applySettings({ aria2next: { enabled: false } });

  assert.equal(request.config.rpcUrl, "http://127.0.0.1:6802/jsonrpc");
  assert.equal(request.payload.method, "aria2.shutdown");
  assert.deepEqual(request.payload.params, ["token:stale-process-secret"]);
  preferenceValues.clear();
});

test("service shutdown waits for the Aria2Next shutdown RPC", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.exitOnClose", true);
  preferenceValues.set("downloadit.aria2next.rpcPort", 6801);
  preferenceValues.set("downloadit.aria2next.secret", "shutdown-secret");

  const service = new DownloadItService({ version: "test" });
  service.idmBridge = { stop() {} };
  service.unregisterToolbarWidget = () => {};
  let finishRequest;
  let request = null;
  service.sendAria2Request = (config, payload) => {
    request = { config, payload };
    return new Promise(resolve => {
      finishRequest = resolve;
    });
  };

  let settled = false;
  const shutdownPromise = service.shutdown().then(() => {
    settled = true;
  });
  await Promise.resolve();

  assert.equal(settled, false);
  assert.equal(request.config.rpcUrl, "http://127.0.0.1:6801/jsonrpc");
  assert.equal(request.payload.method, "aria2.shutdown");
  assert.deepEqual(request.payload.params, ["token:shutdown-secret"]);

  finishRequest({ result: "OK" });
  await shutdownPromise;
  assert.equal(settled, true);
});

test("Aria2Next shutdown kills only its own process when the RPC fails", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.exitOnClose", true);

  const service = new DownloadItService({ version: "test" });
  service.idmBridge = { stop() {} };
  service.unregisterToolbarWidget = () => {};
  let killed = 0;
  const process = { kill() { killed++; } };
  service.aria2NextProcess = process;
  service.sendAria2Request = async () => {
    throw new Error("network is already shutting down");
  };

  await service.shutdownAria2NextIfEnabled();
  assert.equal(killed, 1);
  assert.equal(service.aria2NextProcess, null);
  preferenceValues.clear();
});

test("removing a custom auto-start aria2 downloader shuts down its process", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  const id = "11111111-1111-4111-8111-111111111111";
  const configuration = {
    rpcUrl: "http://127.0.0.1:6800/jsonrpc",
    secret: "custom-secret",
    executablePath: "C:\\Tools\\aria2c.exe",
    configurationPath: "",
    autoStart: true,
    startupArguments: "",
    downloadDirectory: "",
  };
  service.customDownloaderDocument = {
    version: 1,
    downloaders: [{
      id,
      name: "Custom Aria2",
      enabled: true,
      type: "aria2",
      startHidden: true,
      aria2: configuration,
    }],
  };
  let killed = 0;
  const process = { isRunning: false, kill() { killed++; } };
  service.aria2Processes = new Map([[id, {
    process,
    config: { ...configuration },
  }]]);
  service.aria2StartupPromises = new Map();
  service.normalizeCustomDownloaderFilePaths = value => value;
  service.writeCustomDownloaders = async () => {};
  let request = null;
  service.sendAria2Request = async (config, payload) => {
    request = { config, payload };
    return { result: "OK" };
  };

  await service.applySettings({
    customDownloaders: { version: 1, downloaders: [] },
  });

  assert.equal(request.config.rpcUrl, configuration.rpcUrl);
  assert.equal(request.payload.method, "aria2.shutdown");
  assert.deepEqual(request.payload.params, ["token:custom-secret"]);
  assert.equal(killed, 0);
  assert.equal(service.aria2Processes.has(id), false);
  preferenceValues.clear();
});

test("service shutdown closes custom aria2 processes started by DownloadIt", async () => {
  preferenceValues.clear();
  const service = new DownloadItService({ version: "test" });
  service.idmBridge = { stop() {} };
  service.unregisterToolbarWidget = () => {};
  const id = "22222222-2222-4222-8222-222222222222";
  const config = {
    rpcUrl: "http://127.0.0.1:6800/jsonrpc",
    secret: "shutdown-secret",
    autoStart: true,
  };
  let killed = 0;
  service.customDownloaderDocument = {
    version: 1,
    downloaders: [{ id, type: "aria2", aria2: config }],
  };
  service.aria2Processes.set(id, {
    process: { isRunning: false, kill() { killed++; } },
    config,
  });
  let request;
  service.sendAria2Request = async (requestConfig, payload) => {
    request = { requestConfig, payload };
    return { result: "OK" };
  };

  await service.shutdown();

  assert.equal(request.requestConfig.rpcUrl, config.rpcUrl);
  assert.equal(request.payload.method, "aria2.shutdown");
  assert.deepEqual(request.payload.params, ["token:shutdown-secret"]);
  assert.equal(killed, 0);
  assert.equal(service.aria2Processes.has(id), false);
  preferenceValues.clear();
});

test("Aria2Next startup launches after a failed probe without recursive waiting", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.rpcPort", 6800);
  preferenceValues.set("downloadit.aria2next.downloadDir", "C:\\Downloads");

  const service = createSettingsService();
  service.deployAria2NextBinary = async () =>
    "C:\\Profile\\DownloadIt\\aria2-next.exe";
  const launches = [];
  service.startDetachedProcess = (...args) => launches.push(args);
  let probes = 0;
  service.probeAria2Next = async () => {
    probes++;
    if (probes === 1) {
      throw new DownloadItError("aria2-unavailable");
    }
    return { version: "2.5.5" };
  };

  assert.equal(await service.ensureAria2NextRunning(), true);
  assert.equal(probes, 2);
  assert.equal(launches.length, 1);
  assert.equal(launches[0][0], "C:\\Profile\\DownloadIt\\aria2-next.exe");
  assert.deepEqual(launches[0][1], [
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    "--rpc-listen-port=6800",
    "--dir=C:\\Downloads",
  ]);
  preferenceValues.clear();
});

test("Aria2Next startup is shared before binary deployment", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.downloadDir", "C:\\Downloads");
  const service = createSettingsService();
  let finishDeployment;
  let deployments = 0;
  service.deployAria2NextBinary = () => {
    deployments++;
    return new Promise(resolve => {
      finishDeployment = resolve;
    });
  };
  let launches = 0;
  service.startDetachedProcess = () => {
    launches++;
    return { isRunning: false, kill() {} };
  };
  let probes = 0;
  service.probeAria2Next = async () => {
    probes++;
    if (probes === 1) {
      throw new DownloadItError("aria2-unavailable");
    }
    return { version: "2.5.5" };
  };

  const first = service.ensureAria2NextRunning();
  const sharedStartup = service.aria2NextStartupPromise;
  const second = service.ensureAria2NextRunning();
  assert.ok(sharedStartup);
  assert.equal(service.aria2NextStartupPromise, sharedStartup);
  assert.equal(deployments, 1);

  finishDeployment("C:\\Profile\\DownloadIt\\aria2-next.exe");
  await Promise.all([first, second]);
  assert.equal(launches, 1);
  assert.equal(service.aria2NextStartupPromise, null);
  assert.equal(service.aria2NextOnline, true);
  preferenceValues.clear();
});

test("Aria2Next startup failures clear the managed process handle", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.downloadDir", "C:\\Downloads");
  const service = createSettingsService();
  service.deployAria2NextBinary = async () =>
    "C:\\Profile\\DownloadIt\\aria2-next.exe";
  let killed = 0;
  service.startDetachedProcess = () => ({
    isRunning: true,
    kill() {
      killed++;
    },
  });
  let probes = 0;
  service.probeAria2Next = async () => {
    probes++;
    if (probes === 1) {
      throw new DownloadItError("aria2-unavailable");
    }
    throw new DownloadItError("aria2next-rpc-error");
  };

  await assert.rejects(
    service.ensureAria2NextRunning(),
    error => error.code === "aria2next-rpc-error",
  );
  assert.equal(killed, 1);
  assert.equal(service.aria2NextProcess, null);
  assert.equal(service.aria2NextStartupPromise, null);
  assert.equal(service.aria2NextOnline, false);
  preferenceValues.clear();
});

test("disabling Aria2Next waits for startup and shuts down the started process", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.rpcPort", 6803);
  preferenceValues.set("downloadit.aria2next.secret", "old-secret");
  preferenceValues.set("downloadit.aria2next.downloadDir", "C:\\Old");
  const service = createSettingsService();
  let finishDeployment;
  service.deployAria2NextBinary = () => new Promise(resolve => {
    finishDeployment = resolve;
  });
  let processStarted = false;
  let finishReadyProbe;
  let readyProbeStarted;
  const readyProbe = new Promise(resolve => {
    readyProbeStarted = resolve;
  });
  const process = { isRunning: false, kill() {} };
  let launches = 0;
  service.startDetachedProcess = () => {
    launches++;
    processStarted = true;
    return process;
  };
  service.probeAria2Next = async () => {
    if (!processStarted) {
      throw new DownloadItError("aria2-unavailable");
    }
    readyProbeStarted();
    return new Promise(resolve => {
      finishReadyProbe = resolve;
    });
  };
  let shutdownRequest = null;
  service.sendAria2Request = async (config, payload) => {
    shutdownRequest = { config, payload };
    return { result: "OK" };
  };

  const startup = service.ensureAria2NextRunning();
  finishDeployment("C:\\Profile\\DownloadIt\\aria2-next.exe");
  await readyProbe;
  let disabled = false;
  const disable = service.applySettings({ aria2next: { enabled: false } })
    .then(() => {
      disabled = true;
    });
  await Promise.resolve();
  assert.equal(disabled, false);

  finishReadyProbe({ version: "2.5.5" });
  await Promise.all([startup, disable]);
  assert.equal(launches, 1);
  assert.equal(shutdownRequest.config.rpcUrl, "http://127.0.0.1:6803/jsonrpc");
  assert.deepEqual(shutdownRequest.payload.params, ["token:old-secret"]);
  assert.equal(service.aria2NextProcess, null);
  assert.equal(service.aria2NextOnline, false);
  assert.equal(preferenceValues.get("downloadit.aria2next.enabled"), false);
  preferenceValues.clear();
});

test("changing Aria2Next runtime settings shuts down the old instance before probing the new one", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.rpcPort", 6800);
  preferenceValues.set("downloadit.aria2next.secret", "old-secret");
  preferenceValues.set("downloadit.aria2next.downloadDir", "C:\\Old");
  preferenceValues.set("downloadit.aria2next.extraArgs", "--continue=false");
  const service = createSettingsService();
  const oldProcess = { isRunning: false, kill() {} };
  service.aria2NextProcess = oldProcess;
  service.aria2NextOnline = true;
  const shutdowns = [];
  service.sendAria2Request = async (config, payload) => {
    if (payload.method === "aria2.shutdown") {
      shutdowns.push({ config, payload });
      return { result: "OK" };
    }
    throw new Error("unexpected Aria2Next RPC request");
  };
  service.deployAria2NextBinary = async () =>
    "C:\\Profile\\DownloadIt\\aria2-next.exe";
  let started = false;
  const launches = [];
  service.startDetachedProcess = (...args) => {
    started = true;
    launches.push(args);
    return { isRunning: false, kill() {} };
  };
  service.probeAria2Next = async () => {
    if (!started) {
      throw new DownloadItError("aria2-unavailable");
    }
    return { version: "2.5.5" };
  };

  const snapshot = await service.applySettings({
    aria2next: {
      enabled: true,
      rpcPort: 6804,
      secret: "new-secret",
      downloadDir: "C:\\New",
      extraArgs: "--continue=true",
    },
  });
  assert.equal(snapshot.aria2NextOnline, false);
  await service.builtInRefreshPromise;

  assert.equal(shutdowns.length, 1);
  assert.equal(shutdowns[0].config.rpcUrl, "http://127.0.0.1:6800/jsonrpc");
  assert.deepEqual(shutdowns[0].payload.params, ["token:old-secret"]);
  assert.equal(launches.length, 1);
  assert.deepEqual(launches[0][1], [
    "--continue=true",
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    "--rpc-listen-port=6804",
    "--rpc-secret=new-secret",
    "--dir=C:\\New",
  ]);
  assert.equal(service.aria2NextOnline, true);
  assert.equal(service.createAria2NextDescriptor().available, true);
  preferenceValues.clear();
});

test("Aria2Next is unavailable until the current configuration passes its RPC probe", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "aria2next", id: "aria2next" }),
  );
  const service = createSettingsService();
  service.probeAria2Next = async () => {
    throw new DownloadItError("aria2next-rpc-error");
  };

  await assert.rejects(
    service.refreshAria2Next(),
    error => error.code === "aria2next-rpc-error",
  );
  assert.equal(service.readSettings().aria2NextOnline, false);
  assert.equal(service.listAria2NextDownloaders().length, 0);
  assert.deepEqual(service.defaultDownloader.ref, {
    provider: "native",
    id: "firefox",
  });

  service.probeAria2Next = async () => ({ version: "2.5.5" });
  await service.refreshAria2Next();
  assert.equal(service.readSettings().aria2NextOnline, true);
  assert.equal(service.listAria2NextDownloaders().length, 1);
  assert.deepEqual(service.defaultDownloader.ref, {
    provider: "aria2next",
    id: "aria2next",
  });
  preferenceValues.clear();
});

test("Linux Aria2Next startup uses the ABI-selected profile executable", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.aria2next.enabled", true);
  preferenceValues.set("downloadit.aria2next.downloadDir", "/home/test/Downloads");
  servicesMock.appinfo.OS = "Linux";
  servicesMock.appinfo.XPCOMABI = "x86_64-gcc3";

  const service = createSettingsService("linux");
  service.deployAria2NextBinary = async () =>
    "/home/test/.mozilla/firefox/profile/DownloadIt/aria2-next";
  const launches = [];
  service.startDetachedProcess = (...args) => launches.push(args);
  let probes = 0;
  service.probeAria2Next = async () => {
    probes++;
    if (probes === 1) {
      throw new DownloadItError("aria2-unavailable");
    }
    return { version: "2.5.5" };
  };

  try {
    assert.equal(await service.ensureAria2NextRunning(), true);
    assert.equal(launches.length, 1);
    assert.equal(
      launches[0][0],
      "/home/test/.mozilla/firefox/profile/DownloadIt/aria2-next",
    );
    assert.equal(launches[0][4], undefined);
  } finally {
    servicesMock.appinfo.OS = "WINNT";
    servicesMock.appinfo.XPCOMABI = "x86_64-msvc-x64";
    preferenceValues.clear();
  }
});

test("Linux Aria2Next deployment replaces an invalid binary and sets mode 0755", async () => {
  preferenceValues.clear();
  servicesMock.appinfo.OS = "Linux";
  servicesMock.appinfo.XPCOMABI = "x86_64-gcc3";
  const service = createSettingsService("linux");
  service.addonData = {
    resourceURI: {
      resolve: name => `resource://downloadit/${name}`,
    },
  };
  service.readResourceBytes = async uri => {
    assert.equal(uri, "resource://downloadit/aria2-next-linux-x86_64");
    return { length: 3852672 };
  };

  const originalIOUtils = { ...ioUtilsMock };
  let deployed = false;
  let writes = 0;
  let permissions = null;
  ioUtilsMock.makeDirectory = async () => {};
  ioUtilsMock.remove = async () => {};
  ioUtilsMock.stat = async () => ({ size: deployed ? 3852672 : 12 });
  ioUtilsMock.computeHexDigest = async () =>
    deployed
      ? "b6f2cdadcd34ba16dd7fcb29de4b84c36f893f9b223a9a05157d1892687a45a0"
      : "invalid";
  ioUtilsMock.write = async (_path, bytes, options) => {
    assert.equal(bytes.length, 3852672);
    assert.match(options.tmpPath, /aria2-next\.tmp$/);
    writes++;
    deployed = true;
  };
  ioUtilsMock.setPermissions = async (path, mode) => {
    permissions = { path, mode };
  };

  try {
    const path = await service.deployAria2NextBinary();
    assert.equal(path, "C:\\Profile\\DownloadIt\\aria2-next");
    assert.equal(writes, 1);
    assert.deepEqual(permissions, { path, mode: 0o755 });
  } finally {
    for (const key of Object.keys(ioUtilsMock)) {
      delete ioUtilsMock[key];
    }
    Object.assign(ioUtilsMock, originalIOUtils);
    servicesMock.appinfo.OS = "WINNT";
    servicesMock.appinfo.XPCOMABI = "x86_64-msvc-x64";
    preferenceValues.clear();
  }
});

test("Linux hides FlashGot cache and falls back to Firefox without deleting preferences", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.abdm.enabled", false);
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
  assert.deepEqual(refreshes, ["xdm"]);
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
  }, {
    id: "abdm",
    ref: { provider: "abdm", id: "abdm" },
    singleton: true,
  }, {
    id: "xdm",
    ref: { provider: "xdm", id: "xdm" },
    singleton: true,
  }, {
    id: "uget",
    ref: { provider: "uget", id: "uget" },
    singleton: true,
  }, {
    id: "aria2next",
    ref: { provider: "aria2next", id: "aria2next" },
    singleton: true,
  }]);
  assert.equal(initial.builtInProtocols[0].settings.enabled, false);
  assert.equal(initial.builtInProtocols[1].settings.enabled, true);
  assert.equal(initial.builtInProtocols[3].settings.enabled, false);
  assert.equal(initial.builtInProtocols[4].settings.enabled, false);
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
  preferenceValues.set("downloadit.abdm.enabled", false);
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
  assert.deepEqual(refreshes, ["xdm", "flashgot"]);
});

test("manager refresh probes enabled built-ins without waiting or failing FlashGot", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.abdm.enabled", false);
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
  assert.deepEqual(refreshes, ["jdownloader", "xdm", "flashgot"]);
  assert.equal(service.builtInRefreshPromise, builtInRefresh);

  rejectJDownloader(new Error("offline"));
  const results = await builtInRefresh;
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason.message, "offline");
  assert.equal(results[1].status, "fulfilled");
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

test("Linux shell fallback keeps custom executable paths and arguments isolated", () => {
  const executablePath = "/opt/Download Manager/xdm; touch not-run";
  const shellChecks = [];
  let launch = null;
  localFileFactory = () => ({
    initWithPath(path) {
      this.path = path;
    },
    exists() {
      return this.path === "/bin/sh";
    },
    isFile() {
      return this.path === "/bin/sh";
    },
    isExecutable() {
      return this.path === "/bin/sh";
    },
  });
  processFactory = () => ({
    init(file) {
      this.executablePath = file.path;
    },
    run(blocking, argumentsList, count) {
      shellChecks.push({
        executablePath: this.executablePath,
        blocking,
        argumentsList,
        count,
      });
      this.exitValue = 0;
    },
    runwAsync(argumentsList, count) {
      launch = {
        executablePath: this.executablePath,
        argumentsList,
        count,
      };
    },
  });

  try {
    const service = createService("linux");
    const [descriptor] = service.listCustomDownloaders({
      version: 1,
      downloaders: [{
        id: "00000000-0000-4000-8000-000000000000",
        name: "Fallback command",
        enabled: true,
        type: "command",
        command: { executablePath, argumentsTemplate: "[URL]" },
      }],
    });
    assert.equal(descriptor.available, true);
    assert.deepEqual(shellChecks, [{
      executablePath: "/bin/sh",
      blocking: true,
      argumentsList: [
        "-c",
        'test -f "$1" && test -x "$1"',
        "downloadit-path-test",
        executablePath,
      ],
      count: 4,
    }]);

    const argument = "$(touch still-not-run) value";
    service.startDetachedProcess(executablePath, ["--output", argument]);
    assert.equal(shellChecks.length, 2);
    assert.deepEqual(shellChecks[1].argumentsList, [
      "-c",
      'test -f "$1" && test -x "$1"',
      "downloadit-path-test",
      executablePath,
    ]);
    assert.deepEqual(launch, {
      executablePath: "/bin/sh",
      argumentsList: [
        "-c",
        'exec "$@"',
        "downloadit-launch",
        executablePath,
        "--output",
        argument,
      ],
      count: 6,
    });
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

test("ABDM probes are shared, validate JSON queues, and ignore stale configuration", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.abdm.enabled", true);
  preferenceValues.set("downloadit.abdm.endpoint", "http://127.0.0.1:15151/");
  preferenceValues.set("downloadit.abdm.apiKey", "secret");
  const service = createService();
  let requestCount = 0;
  let finishRequest;
  service.sendABDMRequest = (...args) => {
    requestCount++;
    assert.deepEqual(args, [
      "GET",
      "http://127.0.0.1:15151/queues",
      null,
      "secret",
      3000,
    ]);
    return new Promise(resolve => {
      finishRequest = resolve;
    });
  };

  const first = service.probeABDM();
  const second = service.probeABDM();
  assert.equal(requestCount, 1);
  finishRequest({ status: 200, text: "[]" });
  assert.deepEqual(await first, []);
  assert.deepEqual(await second, []);
  assert.equal(service.abdmOnline, true);
  assert.equal(service.abdmProbePromise, null);

  requestCount = 0;
  service.abdmOnline = false;
  const stale = service.probeABDM();
  preferenceValues.set("downloadit.abdm.endpoint", "http://127.0.0.1:15152/");
  finishRequest({ status: 200, text: "[]" });
  await stale;
  assert.equal(service.abdmOnline, false);
  assert.equal(service.abdmProbePromise, null);

  service.sendABDMRequest = async () => ({ status: 503, text: "offline" });
  await assert.rejects(
    service.probeABDM({ endpoint: "http://127.0.0.1:15152/", apiKey: "secret" }),
    error => error instanceof DownloadItError &&
      error.code === "abdm-http-error" && error.args.status === 503,
  );
  service.sendABDMRequest = async () => ({ status: 200, text: "{}" });
  await assert.rejects(
    service.probeABDM({ endpoint: "http://127.0.0.1:15152/", apiKey: "secret" }),
    error => error.code === "abdm-response-invalid",
  );
});

test("ABDM submission uses API key, task headers, and silentStart", async () => {
  preferenceValues.clear();
  preferenceValues.set("downloadit.abdm.enabled", true);
  preferenceValues.set("downloadit.abdm.endpoint", "http://127.0.0.1:15151/");
  preferenceValues.set("downloadit.abdm.apiKey", "secret");
  preferenceValues.set("downloadit.autoStartTasks", false);
  const service = createService();
  let probeOptions;
  service.probeABDM = async options => {
    probeOptions = options;
    return [];
  };
  let request;
  service.sendABDMRequest = async (...args) => {
    request = args;
    return { status: 201, text: "" };
  };
  const result = await service.downloadViaABDM("abdm", {
    referer: "https://example.com/page",
    dlpageReferer: "https://example.com",
    useragent: "Firefox Test",
    links: [{
      url: "https://example.com/file.zip",
      filename: "file.zip",
      cookies: "session=1",
      postdata: "",
    }],
  }, { autoStartTask: false });
  assert.deepEqual(result, { succeeded: 1, failed: 0 });
  assert.deepEqual(probeOptions, {
    endpoint: "http://127.0.0.1:15151/",
    apiKey: "secret",
  });
  assert.equal(request[0], "POST");
  assert.equal(request[1], "http://127.0.0.1:15151/add");
  assert.equal(request[3], "secret");
  assert.deepEqual(JSON.parse(request[2]), {
    items: [{
      link: "https://example.com/file.zip",
      headers: {
        Cookie: "session=1",
        Referer: "https://example.com/page",
        "User-Agent": "Firefox Test",
      },
      downloadPage: "https://example.com",
      suggestedName: "file.zip",
    }],
    options: { silentAdd: true, silentStart: false },
  });
  await assert.rejects(
    service.downloadViaABDM("abdm", {
      links: [{ url: "https://example.com/file.zip", postdata: "a=1" }],
    }),
    error => error.code === "abdm-post-unsupported",
  );
});

test("ABDM starts a selected launcher after an unavailable probe", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  assert.equal(service.createABDMDescriptor({
    enabled: true,
    launchPath: "C:\\ABDM\\ABDownloadManager.exe",
  }).available, true);
  const launches = [];
  service.startDetachedProcess = (...args) => launches.push(args);
  service.probeABDM = async options => {
    assert.equal(options.endpoint, "http://127.0.0.1:15152/");
    assert.equal(options.apiKey, "draft-key");
    return [];
  };
  const delays = [];
  await service.ensureABDMRunning({
    enabled: true,
    endpoint: "http://127.0.0.1:15152/",
    apiKey: "draft-key",
    launchPath: "C:\\ABDM\\ABDownloadManager.exe",
  }, {
    delay: async milliseconds => delays.push(milliseconds),
  });
  assert.deepEqual(launches, [[
    "C:\\ABDM\\ABDownloadManager.exe",
    [],
    null,
    false,
    { validateFile: false },
  ]]);
  assert.deepEqual(delays, [1000]);
  assert.equal(service.abdmStartupPromise, null);
});

test("ABDM shares a pending launcher start", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  let launches = 0;
  service.startDetachedProcess = () => {
    launches++;
  };
  let finishProbe;
  service.probeABDM = () => new Promise(resolve => {
    finishProbe = resolve;
  });
  const settings = {
    enabled: true,
    launchPath: "C:\\ABDM\\ABDownloadManager.exe",
  };
  const first = service.ensureABDMRunning(settings, { delay: async () => {} });
  const second = service.ensureABDMRunning(settings, { delay: async () => {} });
  await Promise.resolve();
  assert.equal(launches, 1);
  finishProbe([]);
  await Promise.all([first, second]);
  assert.equal(service.abdmStartupPromise, null);
});

test("draft XDM and ABDM connection tests do not change online state", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  service.sendXDMRequest = async () => ({
    status: 200,
    text: '{"enabled":true}',
  });
  await service.testXDMConfiguration();
  assert.equal(service.xdmOnline, false);

  service.sendABDMRequest = async () => ({ status: 200, text: "[]" });
  await service.testABDMConfiguration();
  assert.equal(service.abdmOnline, false);
});

test("ABDM connection tests start a draft path only after an offline result", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  const probeOptions = [];
  let probeCount = 0;
  service.probeABDM = async options => {
    probeOptions.push(options);
    probeCount++;
    if (probeCount === 1) {
      throw new DownloadItError("abdm-unavailable");
    }
    return [];
  };
  let startupSettings;
  let startupOptions;
  service.ensureABDMRunning = async (settings, options) => {
    startupSettings = settings;
    startupOptions = options;
  };
  assert.deepEqual(await service.testABDMConfiguration({
    launchPath: "C:\\ABDM\\ABDownloadManager.exe",
  }), []);
  assert.equal(probeCount, 2);
  assert.equal(startupSettings.launchPath, "C:\\ABDM\\ABDownloadManager.exe");
  assert.deepEqual(startupOptions.probeOptions, {
    persist: false,
    updateState: false,
  });
  assert.deepEqual(probeOptions, [{
    endpoint: "http://127.0.0.1:15151/",
    apiKey: "",
    persist: false,
    updateState: false,
  }, {
    endpoint: "http://127.0.0.1:15151/",
    apiKey: "",
    persist: false,
    updateState: false,
  }]);
});

test("ABDM accepts an absolute manual launch path without Firefox file enumeration", () => {
  const service = createSettingsService("linux");
  const settings = service.normalizeABDMSettings({
    enabled: true,
    launchPath: "/opt/abdm/ab-download-manager",
  });
  assert.equal(settings.launchPath, "/opt/abdm/ab-download-manager");
  assert.equal(service.createABDMDescriptor(settings).available, true);
  assert.throws(
    () => service.normalizeABDMSettings({ launchPath: "ab-download-manager" }),
    error => error.code === "abdm-launch-path-invalid",
  );
});

test("XDM probes enabled local state and submits its browser payload", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();
  let requestCount = 0;
  let finishProbe;
  service.sendXDMRequest = async (...args) => {
    requestCount += 1;
    assert.deepEqual(args, ["GET", "sync", null, 3000]);
    return new Promise(resolve => {
      finishProbe = resolve;
    });
  };
  const first = service.probeXDM();
  const second = service.probeXDM();
  assert.equal(requestCount, 1);
  finishProbe({ status: 200, text: '{"enabled":true}' });
  assert.deepEqual(await first, { enabled: true });
  assert.deepEqual(await second, { enabled: true });
  assert.equal(service.xdmOnline, true);
  assert.equal(service.xdmProbePromise, null);
  assert.equal(service.createXDMDescriptor().available, true);

  service.sendXDMRequest = async () => ({ status: 200, text: '{"enabled":false}' });
  await assert.rejects(
    service.probeXDM(),
    error => error.code === "xdm-disabled" && service.xdmOnline === false,
  );
  service.sendXDMRequest = async () => ({ status: 200, text: "{}" });
  await assert.rejects(
    service.probeXDM(),
    error => error.code === "xdm-response-invalid",
  );

  let request;
  service.probeXDM = async () => ({ enabled: true });
  service.sendXDMRequest = async (...args) => {
    request = args;
    return { status: 201, text: "" };
  };
  assert.deepEqual(await service.downloadViaXDM("xdm", {
    referer: "https://example.com/page",
    useragent: "Firefox Test",
    links: [{
      url: "https://example.com/file.zip",
      filename: "file.zip",
      cookies: "session=1",
      postdata: "",
    }],
  }), { succeeded: 1, failed: 0 });
  assert.equal(request[0], "POST");
  assert.equal(request[1], "download");
  assert.deepEqual(JSON.parse(request[2]), {
    url: "https://example.com/file.zip",
    cookie: "session=1",
    requestHeaders: {
      "User-Agent": ["Firefox Test"],
      Referer: ["https://example.com/page"],
    },
    responseHeaders: {},
    filename: "file.zip",
  });
  await assert.rejects(
    service.downloadViaXDM("xdm", {
      links: [{ url: "https://example.com/file.zip", postdata: "a=1" }],
    }),
    error => error.code === "xdm-post-unsupported",
  );
});

test("XDM starts a selected executable after an unavailable probe", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  service.xdmStartupPromise = null;
  service.isLocalFile = path => path === "C:\\XDM\\xdman.exe";
  assert.equal(service.createXDMDescriptor({
    enabled: true,
    launchPath: "C:\\XDM\\xdman.exe",
  }).available, true);
  let launch;
  service.startDetachedProcess = (...args) => {
    launch = args;
  };
  let probeCount = 0;
  service.probeXDM = async () => {
    probeCount++;
    return { enabled: true };
  };
  const delays = [];
  await service.ensureXDMRunning({
    enabled: true,
    launchPath: "C:\\XDM\\xdman.exe",
  }, {
    delay: async milliseconds => delays.push(milliseconds),
  });
  assert.deepEqual(launch, [
    "C:\\XDM\\xdman.exe",
    [],
    null,
    false,
    { validateFile: false },
  ]);
  assert.deepEqual(delays, [1000]);
  assert.equal(probeCount, 1);
  assert.equal(service.xdmStartupPromise, null);
});

test("XDM accepts an absolute manual launch path without Firefox file enumeration", () => {
  const service = createSettingsService("linux");
  service.isLocalFile = () => false;
  const settings = service.normalizeXDMSettings({
    enabled: true,
    launchPath: "/opt/xdman/xdm-app",
  });
  assert.equal(settings.launchPath, "/opt/xdman/xdm-app");
  assert.equal(service.createXDMDescriptor(settings).available, true);
  assert.throws(
    () => service.normalizeXDMSettings({ launchPath: "xdman-app" }),
    error => error.code === "xdm-launch-path-invalid",
  );
});

test("uGet uses a configured launcher for one quiet process per link", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();
  service.isLocalExecutable = path => [
    "C:\\uGet\\uget.exe",
    "C:\\uGet\\other-uget.exe",
  ].includes(path);
  assert.equal(service.getUGetSettings().enabled, false);
  preferenceValues.set("downloadit.uget.launchPath", "C:\\uGet\\uget.exe");
  assert.equal(service.getUGetSettings().enabled, false);
  preferenceValues.delete("downloadit.uget.launchPath");
  const snapshot = await service.applySettings({
    uget: { enabled: true, launchPath: "C:\\uGet\\uget.exe" },
  });
  assert.equal(preferenceValues.get("downloadit.uget.enabled"), true);
  assert.equal(
    preferenceValues.get("downloadit.uget.launchPath"),
    "C:\\uGet\\uget.exe",
  );
  assert.equal(snapshot.uget.enabled, true);
  assert.equal(service.listUGetDownloaders().length, 1);

  const launches = [];
  service.startDetachedProcess = (...args) => launches.push(args);
  downloadsMock.getPreferredDownloadsDirectory = async () => "D:\\Downloads";
  try {
    assert.deepEqual(await service.downloadViaUGet("uget", {
      referer: "https://example.com/page",
      useragent: "Firefox Test",
      links: [{
        url: "https://example.com/one.zip",
        filename: "one.zip",
        cookies: "session=1",
      }, {
        url: "https://example.com/two.zip",
        postdata: "key=value",
      }],
    }), { succeeded: 2, failed: 0 });
    assert.deepEqual(launches, [[
      "C:\\uGet\\uget.exe",
      [
        "--quiet",
        "--folder=D:\\Downloads",
        "--filename=one.zip",
        "--http-referer=https://example.com/page",
        "--http-user-agent=Firefox Test",
        "--http-cookie-data=session=1",
        "https://example.com/one.zip",
      ],
      null,
      true,
    ], [
      "C:\\uGet\\uget.exe",
      [
        "--quiet",
        "--folder=D:\\Downloads",
        "--http-referer=https://example.com/page",
        "--http-user-agent=Firefox Test",
        "--http-post-data=key=value",
        "https://example.com/two.zip",
      ],
      null,
      true,
    ]]);
    assert.equal(
      launches.flatMap(([, argumentsList]) => argumentsList).includes("--set-offline"),
      false,
    );
  } finally {
    delete downloadsMock.getPreferredDownloadsDirectory;
  }

  let versionLaunch;
  service.startDetachedProcess = (path, argumentsList, onExit, startHidden) => {
    versionLaunch = { path, argumentsList, startHidden };
    const process = { exitValue: 0 };
    Promise.resolve().then(onExit);
    return process;
  };
  await assert.doesNotReject(
    service.testUGetConfiguration({ launchPath: "C:\\uGet\\uget.exe" }),
  );
  assert.deepEqual(versionLaunch, {
    path: "C:\\uGet\\uget.exe",
    argumentsList: ["--version"],
    startHidden: true,
  });

  service.startDetachedProcess = (_path, argumentsList) => {
    if (argumentsList.at(-1).endsWith("two.zip")) {
      throw new Error("launch failed");
    }
  };
  await assert.rejects(
    service.downloadViaUGet("uget", {
      links: [
        { url: "https://example.com/one.zip" },
        { url: "https://example.com/two.zip" },
      ],
    }),
    error => error.code === "uget-partial-failure" &&
      error.args.succeeded === 1 && error.args.failed === 1,
  );

  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "uget", id: "uget" }),
  );
  const disabled = await service.applySettings({ uget: { enabled: false } });
  assert.equal(preferenceValues.get("downloadit.uget.enabled"), false);
  assert.equal(preferenceValues.has("downloadit.uget.launchPath"), false);
  assert.deepEqual(JSON.parse(preferenceValues.get("downloadit.defaultDM")), {
    provider: "native",
    id: "firefox",
  });
  assert.deepEqual(disabled.defaultDownloader.ref, {
    provider: "native",
    id: "firefox",
  });

  preferenceLocks.add("downloadit.uget.launchPath");
  await assert.rejects(
    service.applySettings({
      uget: { enabled: true, launchPath: "C:\\uGet\\other-uget.exe" },
    }),
    /uGet launchPath preference is locked/i,
  );
  preferenceLocks.clear();
});

test("XDM connection tests use a selected path only after an offline result", async () => {
  preferenceValues.clear();
  const service = createSettingsService();
  service.isLocalFile = () => true;
  let probeCount = 0;
  service.probeXDM = async () => {
    probeCount++;
    if (probeCount === 1) {
      throw new DownloadItError("xdm-unavailable");
    }
    return { enabled: true };
  };
  let startupSettings;
  service.ensureXDMRunning = async settings => {
    startupSettings = settings;
  };
  const status = await service.testXDMConfiguration({
    launchPath: "C:\\XDM\\xdman.exe",
  });
  assert.deepEqual(status, { enabled: true });
  assert.equal(probeCount, 2);
  assert.equal(startupSettings.launchPath, "C:\\XDM\\xdman.exe");
});

test("XDM resolves a Linux JAR through Java", () => {
  const service = createSettingsService("linux");
  const jarPath = "/opt/apps/net.sourceforge.xdman/files/xdman/xdman.jar";
  service.isLocalFile = path => path === jarPath;
  service.getLocalFile = path => ({
    path,
    leafName: "xdman.jar",
    parent: {
      path: "/opt/apps/net.sourceforge.xdman/files/xdman",
      clone() {
        return {
          append() {},
          path: "/opt/apps/net.sourceforge.xdman/files/xdman/xdman",
        };
      },
    },
  });
  service.existingExecutablePath = path =>
    path === "/usr/bin/java" ? path : "";
  environmentValues.set("PATH", "/usr/bin");
  assert.deepEqual(service.resolveXDMLaunch({
    enabled: true,
    launchPath: jarPath,
  }), {
    executablePath: "/usr/bin/java",
    argumentsList: ["-jar", jarPath],
  });
  environmentValues.delete("PATH");
});

test("XDM enable preference honors locks and replaces its default", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "xdm", id: "xdm" }),
  );
  const service = createSettingsService();
  service.xdmOnline = true;
  const snapshot = await service.applySettings({ xdm: { enabled: false } });
  assert.equal(preferenceValues.get("downloadit.xdm.enabled"), false);
  assert.equal(snapshot.xdm.enabled, false);
  assert.deepEqual(snapshot.defaultDownloader.ref, {
    provider: "native",
    id: "firefox",
  });

  preferenceLocks.add("downloadit.xdm.enabled");
  await assert.rejects(
    service.applySettings({ xdm: { enabled: true } }),
    /Xtreme Download Manager enabled preference is locked/i,
  );
  preferenceLocks.clear();
});

test("XDM XHR uses the fixed loopback API with privileged request protections", async () => {
  const listeners = new Map();
  const headers = new Map();
  const channel = {
    loadFlags: 0,
    loadInfo: { allowDeprecatedSystemRequests: false, httpsOnlyStatus: 0 },
    redirectionLimit: 1,
    allowSTS: true,
    QueryInterface(interfaceId) {
      assert.equal(interfaceId, interfacesMock.nsIHttpChannel);
      return this;
    },
    setTRRMode(mode) {
      this.trrMode = mode;
    },
  };
  xmlHttpRequestFactory = () => ({
    channel,
    responseText: "ready",
    status: 200,
    open(method, endpoint, asynchronous) {
      assert.equal(method, "POST");
      assert.equal(endpoint, "http://127.0.0.1:8597/download");
      assert.equal(asynchronous, true);
    },
    setRequestHeader(name, value) {
      headers.set(name, value);
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    send(body) {
      assert.equal(body, "{}");
      listeners.get("load")();
    },
  });
  try {
    const service = createService();
    assert.deepEqual(
      await service.sendXDMRequest("POST", "download", "{}"),
      { status: 200, text: "ready" },
    );
    assert.equal(channel.loadFlags, 15);
    assert.equal(channel.trrMode, interfacesMock.nsIRequest.TRR_DISABLED_MODE);
    assert.equal(
      channel.loadInfo.httpsOnlyStatus,
      interfacesMock.nsILoadInfo.HTTPS_ONLY_EXEMPT,
    );
    assert.equal(channel.loadInfo.allowDeprecatedSystemRequests, true);
    assert.equal(channel.redirectionLimit, 0);
    assert.equal(channel.allowSTS, false);
    assert.equal(headers.get("Content-Type"), "application/json; charset=UTF-8");
  } finally {
    xmlHttpRequestFactory = () => ({});
  }
});

test("ABDM XHR bypasses cache, disables redirects, and sends X-Api-Key", async () => {
  const listeners = new Map();
  const headers = new Map();
  const channel = {
    loadFlags: 0,
    loadInfo: { allowDeprecatedSystemRequests: false, httpsOnlyStatus: 0 },
    redirectionLimit: 1,
    allowSTS: true,
    QueryInterface(interfaceId) {
      assert.equal(interfaceId, interfacesMock.nsIHttpChannel);
      return this;
    },
    setTRRMode(mode) {
      this.trrMode = mode;
    },
  };
  xmlHttpRequestFactory = () => ({
    channel,
    responseText: "[]",
    status: 200,
    open(method, endpoint, asynchronous) {
      assert.equal(method, "POST");
      assert.equal(endpoint, "http://127.0.0.1:15151/add");
      assert.equal(asynchronous, true);
    },
    setRequestHeader(name, value) {
      headers.set(name, value);
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    send(body) {
      assert.equal(body, "{}");
      listeners.get("load")();
    },
  });
  try {
    const service = createService();
    assert.deepEqual(
      await service.sendABDMRequest(
        "POST",
        "http://127.0.0.1:15151/add",
        "{}",
        "secret",
      ),
      { status: 200, text: "[]" },
    );
    assert.equal(channel.loadFlags, 15);
    assert.equal(channel.trrMode, interfacesMock.nsIRequest.TRR_DISABLED_MODE);
    assert.equal(channel.redirectionLimit, 0);
    assert.equal(channel.allowSTS, false);
    assert.equal(headers.get("Content-Type"), "application/json; charset=UTF-8");
    assert.equal(headers.get("X-Api-Key"), "secret");
  } finally {
    xmlHttpRequestFactory = () => ({});
  }
});

test("ABDM native provider hides and migrates the FlashGot fallback safely", () => {
  preferenceValues.clear();
  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "flashgot", id: "AB Download Manager" }),
  );
  const service = createSettingsService();
  service.flashGotManagers = ["AB Download Manager", "External"];
  service.abdmOnline = false;
  assert.deepEqual(service.listFlashGotDownloaders().map(item => item.name), [
    "AB Download Manager",
    "External",
  ]);
  service.abdmOnline = true;
  assert.deepEqual(service.listFlashGotDownloaders().map(item => item.name), [
    "External",
  ]);
  service.migrateABDMDefaultManagerPreference();
  assert.deepEqual(JSON.parse(preferenceValues.get("downloadit.defaultDM")), {
    provider: "abdm",
    id: "abdm",
  });

  preferenceValues.set(
    "downloadit.defaultDM",
    JSON.stringify({ provider: "flashgot", id: "AB Download Manager" }),
  );
  preferenceLocks.add("downloadit.defaultDM");
  service.migrateABDMDefaultManagerPreference();
  assert.deepEqual(JSON.parse(preferenceValues.get("downloadit.defaultDM")), {
    provider: "flashgot",
    id: "AB Download Manager",
  });
  preferenceLocks.clear();
});

test("ABDM preferences normalize, honor locks, and clear on disable", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService();
  await service.applySettings({
    abdm: {
      enabled: true,
      endpoint: "http://localhost:15151",
      apiKey: "secret",
      launchPath: "C:\\ABDM\\ABDownloadManager.exe",
    },
  });
  assert.equal(
    preferenceValues.get("downloadit.abdm.endpoint"),
    "http://localhost:15151/",
  );
  assert.equal(preferenceValues.get("downloadit.abdm.apiKey"), "secret");
  assert.equal(
    preferenceValues.get("downloadit.abdm.launchPath"),
    "C:\\ABDM\\ABDownloadManager.exe",
  );
  assert.equal(service.readSettings().abdm.apiKey, "secret");

  preferenceLocks.add("downloadit.abdm.apiKey");
  await assert.rejects(
    service.applySettings({
      abdm: {
        enabled: true,
        endpoint: "http://localhost:15151/",
        apiKey: "changed",
      },
    }),
    /AB Download Manager apiKey preference is locked/i,
  );
  preferenceLocks.clear();

  preferenceLocks.add("downloadit.abdm.launchPath");
  await assert.rejects(
    service.applySettings({
      abdm: {
        enabled: true,
        endpoint: "http://localhost:15151/",
        apiKey: "secret",
        launchPath: "C:\\ABDM\\Changed.exe",
      },
    }),
    /AB Download Manager launchPath preference is locked/i,
  );
  preferenceLocks.clear();

  const snapshot = await service.applySettings({ abdm: { enabled: false } });
  assert.equal(preferenceValues.get("downloadit.abdm.enabled"), false);
  assert.equal(preferenceValues.has("downloadit.abdm.endpoint"), false);
  assert.equal(preferenceValues.has("downloadit.abdm.apiKey"), false);
  assert.equal(preferenceValues.has("downloadit.abdm.launchPath"), false);
  assert.equal(snapshot.abdm.enabled, false);
});

test("saving ABDM settings starts a probe for the manager list", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  const service = createSettingsService("linux");
  service.sendABDMRequest = async (...args) => {
    assert.deepEqual(args, [
      "GET",
      "http://127.0.0.1:15151/queues",
      null,
      "secret",
      3000,
    ]);
    return { status: 200, text: "[]" };
  };

  const snapshot = await service.applySettings({
    abdm: {
      enabled: true,
      endpoint: "http://127.0.0.1:15151/",
      apiKey: "secret",
    },
  });
  assert.equal(snapshot.abdm.online, false);
  const refresh = service.builtInRefreshPromise;
  assert.ok(refresh);
  await refresh;
  assert.equal(service.createABDMDescriptor().available, true);
  assert.deepEqual(service.managers.map(downloader => downloader.name), [
    "AB Download Manager",
    "Firefox",
  ]);
});

test("saving ABDM settings replaces a stale built-in refresh", async () => {
  preferenceValues.clear();
  preferenceLocks.clear();
  preferenceValues.set("downloadit.abdm.enabled", true);
  preferenceValues.set("downloadit.abdm.endpoint", "http://127.0.0.1:15151/");
  preferenceValues.set("downloadit.abdm.apiKey", "old-key");
  const service = createSettingsService("linux");
  let finishOldProbe;
  service.sendABDMRequest = (_method, endpoint) => {
    if (endpoint === "http://127.0.0.1:15151/queues") {
      return new Promise(resolve => {
        finishOldProbe = resolve;
      });
    }
    assert.equal(endpoint, "http://127.0.0.1:15152/queues");
    return Promise.resolve({ status: 200, text: "[]" });
  };

  const oldRefresh = service.refreshConfiguredBuiltInProtocols();
  await service.applySettings({
    abdm: {
      enabled: true,
      endpoint: "http://127.0.0.1:15152/",
      apiKey: "new-key",
    },
  });
  const newRefresh = service.builtInRefreshPromise;
  assert.ok(newRefresh);
  assert.notEqual(newRefresh, oldRefresh);
  await newRefresh;
  assert.equal(service.createABDMDescriptor().available, true);

  finishOldProbe({ status: 200, text: "[]" });
  await oldRefresh;
  assert.equal(service.createABDMDescriptor().available, true);
});
