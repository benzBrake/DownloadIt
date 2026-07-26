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
const createdStreams = [];
const downloadsMock = { ALL: Symbol("Downloads.ALL") };
const downloadPathsMock = {};
const ioUtilsMock = {};
const interfacesMock = {
  nsIReferrerInfo: { EMPTY: 0 },
  nsIStringInputStream: Symbol("nsIStringInputStream"),
  nsIUploadChannel2: Symbol("nsIUploadChannel2"),
};
const servicesMock = {
  appinfo: { name: "Firefox", OS: "WINNT" },
  io: { newURI: spec => ({ spec }) },
  prefs: {
    clearUserPref: name => preferenceValues.delete(name),
    getBoolPref: (_name, fallback) => fallback,
    getStringPref: (name, fallback) => preferenceValues.get(name) ?? fallback,
    prefIsLocked: () => false,
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
globalThis.Services = servicesMock;
globalThis.IOUtils = ioUtilsMock;
globalThis.PathUtils = {
  profileDir: "C:\\Profile",
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
