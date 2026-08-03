import test from "node:test";
import assert from "node:assert/strict";

import {
  ABDM_DEFAULT_ENDPOINT,
  ABDM_DOWNLOADER_ID,
  ABDM_PROVIDER,
  ABDMConfigError,
  buildAria2Request,
  buildABDMRequest,
  buildAria2StartupArguments,
  buildJDownloaderRequest,
  BUILT_IN_PROTOCOLS,
  COMMAND_PLACEHOLDERS,
  COMMAND_TEMPLATE_PRESETS,
  commandTemplateUsesBatch,
  createDownloaderRef,
  createEmptyCustomDownloaderDocument,
  CustomDownloaderConfigError,
  DownloaderProviderRegistry,
  expandCommandTemplate,
  getCustomDownloaderCapabilities,
  getABDMCapabilities,
  getFlashGotDownloaderCapabilities,
  getJDownloaderCapabilities,
  getJDownloaderReferer,
  getNativeDownloadFilenameCandidate,
  getNativeDownloaderCapabilities,
  inspectAria2Response,
  isLoopbackAria2URL,
  isNativeDownloadURL,
  JDOWNLOADER_DEFAULT_ENDPOINT,
  JDOWNLOADER_DOWNLOADER_ID,
  JDOWNLOADER_PROVIDER,
  NATIVE_DOWNLOADER_ID,
  normalizeCustomDownloaderDocument,
  normalizeABDMEndpoint,
  normalizeDownloaderCapabilities,
  normalizeJDownloaderEndpoint,
  normalizeJDownloaderJavaArguments,
  parseJDownloaderDiscoveryResponse,
  parseDownloaderRef,
  serializeDownloaderRef,
  stringifyCustomDownloaderDocument,
  tokenizeArguments,
  validateCustomDownloaderDocument,
  validateJDownloaderLaunchPath,
} from "../addon/chrome/content/DownloadItDownloaders.sys.mjs";

test("downloader capabilities are normalized as tri-state metadata", () => {
  assert.deepEqual(normalizeDownloaderCapabilities({
    post: true,
    cookies: false,
    batch: "yes",
  }), {
    post: true,
    cookies: false,
    batch: null,
    directory: null,
    taskStart: null,
  });
});

test("FlashGot capability metadata is conservative for unknown managers", () => {
  assert.deepEqual(
    getFlashGotDownloaderCapabilities("Internet Download Manager"),
    { post: true, cookies: true, batch: true, directory: false, taskStart: false },
  );
  assert.deepEqual(
    getFlashGotDownloaderCapabilities("GetRight"),
    { post: false, cookies: true, batch: true, directory: false, taskStart: false },
  );
  assert.deepEqual(
    getFlashGotDownloaderCapabilities("Future Download Manager"),
    { post: null, cookies: null, batch: null, directory: false, taskStart: false },
  );
});

test("custom downloader capabilities follow command placeholders and provider features", () => {
  assert.deepEqual(getCustomDownloaderCapabilities({
    type: "command",
    command: {
      argumentsTemplate: "[URL] [--data=POST] [--load-cookies=CFILE] [--dir=FOLDER]",
    },
  }), {
    post: true,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: false,
  });
  assert.deepEqual(getCustomDownloaderCapabilities({
    type: "command",
    command: { argumentsTemplate: "[URL]" },
  }), {
    post: false,
    cookies: false,
    batch: true,
    directory: false,
    taskStart: false,
  });
  assert.deepEqual(getCustomDownloaderCapabilities({ type: "aria2" }), {
    post: false,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: false,
  });
});

test("native downloader policy supports Firefox HTTP downloads", () => {
  assert.equal(NATIVE_DOWNLOADER_ID, "firefox");
  assert.deepEqual(getNativeDownloaderCapabilities(), {
    post: true,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: false,
  });
  assert.equal(isNativeDownloadURL("https://example.com/file.zip"), true);
  assert.equal(isNativeDownloadURL("http://example.com/file.zip"), true);
  assert.equal(isNativeDownloadURL("ftp://example.com/file.zip"), false);
  assert.equal(isNativeDownloadURL("magnet:?xt=urn:btih:test"), false);
  assert.equal(
    getNativeDownloadFilenameCandidate({
      url: "https://example.com/path/fallback.zip",
      filename: "explicit.zip",
    }),
    "explicit.zip",
  );
  assert.equal(
    getNativeDownloadFilenameCandidate({
      url: "https://example.com/path/My%20Archive.zip?token=1",
    }),
    "My Archive.zip",
  );
  assert.equal(
    getNativeDownloadFilenameCandidate({ url: "https://example.com/" }),
    "download",
  );
});

test("JDownloader protocol validates loopback endpoints and discovery output", () => {
  assert.equal(JDOWNLOADER_PROVIDER, "jdownloader");
  assert.equal(JDOWNLOADER_DOWNLOADER_ID, "jdownloader");
  assert.equal(
    normalizeJDownloaderEndpoint("http://localhost:9666/"),
    "http://localhost:9666/flashgot",
  );
  assert.equal(
    normalizeJDownloaderEndpoint("http://127.0.0.2:9777/flashgot/"),
    "http://127.0.0.2:9777/flashgot",
  );
  assert.equal(
    normalizeJDownloaderEndpoint("http://[::1]:9666/flashgot"),
    "http://[::1]:9666/flashgot",
  );
  assert.equal(
    getJDownloaderReferer(JDOWNLOADER_DEFAULT_ENDPOINT),
    "http://localhost:9666/flashgot",
  );
  for (const endpoint of [
    "https://127.0.0.1:9666/flashgot",
    "http://example.com:9666/flashgot",
    "http://127.example.com:9666/flashgot",
    "http://127.0.0.1:9666/other",
    "",
    "http://@127.0.0.1:9666/flashgot",
    "http://user@127.0.0.1:9666/flashgot",
    "http://127.0.0.1:9666/flashgot?token=secret",
    "http://127.0.0.1:9666/flashgot#fragment",
  ]) {
    assert.throws(
      () => normalizeJDownloaderEndpoint(endpoint),
      error => error.code === "jdownloader-endpoint-invalid",
    );
  }

  assert.deepEqual(
    parseJDownloaderDiscoveryResponse(
      "C:/Program Files/JDownloader/JDownloader.jar\r\n" +
      "java -Xmx512m -jar C:/Program Files/JDownloader/JDownloader.jar\r\n",
    ),
    {
      path: "C:\\Program Files\\JDownloader\\JDownloader.jar",
      javaArguments: ["-Xmx512m"],
    },
  );
  assert.deepEqual(
    parseJDownloaderDiscoveryResponse(
      "/opt/JDownloader With Space/JDownloader.jar\n" +
      "java -Xms64m -Xmx1G -jar /opt/JDownloader With Space/JDownloader.jar\n",
    ),
    {
      path: "/opt/JDownloader With Space/JDownloader.jar",
      javaArguments: ["-Xms64m", "-Xmx1G"],
    },
  );
  assert.deepEqual(
    parseJDownloaderDiscoveryResponse(
      '"/opt/JDownloader/JDownloader.jar"\n' +
      'java -jar "/opt/JDownloader/JDownloader.jar"\n',
    ),
    {
      path: "/opt/JDownloader/JDownloader.jar",
      javaArguments: [],
    },
  );
  assert.equal(
    validateJDownloaderLaunchPath("/opt/JDownloader/JDownloader", "linux"),
    "/opt/JDownloader/JDownloader",
  );
  assert.equal(
    validateJDownloaderLaunchPath("/opt/JDownloader/JDownloader", "windows"),
    "/opt/JDownloader/JDownloader",
  );
  assert.throws(
    () => validateJDownloaderLaunchPath("C:\\JD\\JDownloader", "windows"),
    error => error.code === "jdownloader-launch-path-invalid",
  );
  assert.deepEqual(normalizeJDownloaderJavaArguments(["-Xmx512m"]), ["-Xmx512m"]);
  assert.deepEqual(normalizeJDownloaderJavaArguments(["-Xms64m", "-Xmx1G"]), [
    "-Xms64m",
    "-Xmx1G",
  ]);
  for (const response of [
    "",
    "relative/JDownloader.jar\njava -jar relative/JDownloader.jar",
    "C:\\JDownloader.jar\ncmd /c calc C:\\JDownloader.jar",
    "C:\\JDownloader.jar\njava -Dfoo=\"bad value\" -jar C:\\JDownloader.jar",
    '"C:\\JDownloader.jar\njava -Xmx512m -jar C:\\JDownloader.jar',
    "C:\\JDownloader.jar\njava -javaagent:evil.jar -jar C:\\JDownloader.jar",
    "C:\\JDownloader.jar\njava -agentlib:jdwp -jar C:\\JDownloader.jar",
    "/opt/JDownloader.jar\njava -jar /opt/Other.jar",
    "/opt/JDownloader.exe\njava -jar /opt/JDownloader.exe",
  ]) {
    assert.throws(
      () => parseJDownloaderDiscoveryResponse(response),
      error => error.code === "jdownloader-discovery-invalid",
    );
  }
});

test("AB Download Manager uses an independent loopback JSON protocol", () => {
  assert.equal(ABDM_PROVIDER, "abdm");
  assert.equal(ABDM_DOWNLOADER_ID, "abdm");
  assert.equal(ABDM_DEFAULT_ENDPOINT, "http://127.0.0.1:15151/");
  assert.deepEqual(getABDMCapabilities(), {
    post: false,
    cookies: true,
    batch: true,
    directory: false,
    taskStart: true,
  });
  assert.equal(
    normalizeABDMEndpoint("http://localhost:15151"),
    "http://localhost:15151/",
  );
  assert.equal(
    normalizeABDMEndpoint("http://[::1]:15151/"),
    "http://[::1]:15151/",
  );
  for (const endpoint of [
    "https://127.0.0.1:15151/",
    "http://example.com:15151/",
    "http://127.0.0.1:15151/api",
    "http://127.0.0.1:15151/?token=secret",
    "http://user@127.0.0.1:15151/",
  ]) {
    assert.throws(
      () => normalizeABDMEndpoint(endpoint),
      error => error instanceof ABDMConfigError &&
        error.code === "abdm-endpoint-invalid",
    );
  }

  const request = buildABDMRequest({
    referer: "https://example.com/page",
    dlpageReferer: "https://example.com",
    useragent: "Firefox Test",
    links: [{
      url: "https://example.com/file.zip",
      cookies: "session=1",
      filename: "file.zip",
      postdata: "",
    }, {
      url: "https://example.com/second.zip",
      cookies: "session=2",
      desc: "Second file",
      postdata: "",
    }],
  }, { autoStartTask: false });
  assert.deepEqual(request, {
    items: [{
      link: "https://example.com/file.zip",
      headers: {
        Cookie: "session=1",
        Referer: "https://example.com/page",
        "User-Agent": "Firefox Test",
      },
      downloadPage: "https://example.com",
      suggestedName: "file.zip",
    }, {
      link: "https://example.com/second.zip",
      headers: {
        Cookie: "session=2",
        Referer: "https://example.com/page",
        "User-Agent": "Firefox Test",
      },
      downloadPage: "https://example.com",
      suggestedName: "Second file",
    }],
    options: { silentAdd: true, silentStart: false },
  });
  assert.throws(
    () => buildABDMRequest({ links: [{ url: "https://example.com/a", postdata: "x=1" }] }),
    error => error.code === "abdm-post-unsupported",
  );
});

test("built-in protocol catalog keeps singleton provider identity in code", () => {
  assert.deepEqual(BUILT_IN_PROTOCOLS, [{
    id: "jdownloader",
    provider: "jdownloader",
    downloaderId: "jdownloader",
    name: "JDownloader",
    singleton: true,
  }, {
    id: "abdm",
    provider: "abdm",
    downloaderId: "abdm",
    name: "AB Download Manager",
    singleton: true,
  }]);
  assert.equal(Object.isFrozen(BUILT_IN_PROTOCOLS), true);
  assert.equal(Object.isFrozen(BUILT_IN_PROTOCOLS[0]), true);
  assert.equal(Object.isFrozen(BUILT_IN_PROTOCOLS[1]), true);
});

test("JDownloader request bodies preserve aligned fields and task-start policy", () => {
  const job = {
    referer: "https://example.com/page",
    links: [
      {
        url: "https://example.com/a?name=one",
        desc: "First\r\nfile",
        filename: "A file.zip",
        cookies: "session=unicode-\u4f60\u597d",
        postdata: "key=\u503c",
      },
      {
        url: "https://example.com/b",
        desc: "Second",
        filename: "B.zip",
        cookies: "session=unicode-\u4f60\u597d",
        postdata: "key=\u503c",
      },
    ],
  };
  const params = new URLSearchParams(buildJDownloaderRequest(job, {
    autoStartTask: false,
    directory: "D:\\Downloads",
  }));
  assert.equal(params.get("autostart"), "0");
  assert.equal(params.get("package"), "DownloadIt");
  assert.equal(params.get("referer"), "https://example.com/page");
  assert.equal(params.get("dir"), "D:\\Downloads");
  assert.equal(params.get("urls"), [job.links[0].url, job.links[1].url].join("\n"));
  assert.equal(params.get("descriptions"), "First file\nSecond");
  assert.equal(params.get("fnames"), "A file.zip\nB.zip");
  assert.equal(params.get("cookies"), "session=unicode-\u4f60\u597d");
  assert.equal(params.get("postData"), "key=\u503c");

  const mixedCookies = structuredClone(job);
  mixedCookies.links[1].cookies = "other=1";
  assert.equal(
    new URLSearchParams(buildJDownloaderRequest(mixedCookies)).has("cookies"),
    false,
  );
  const mixedPost = structuredClone(job);
  mixedPost.links[1].postdata = "";
  assert.throws(
    () => buildJDownloaderRequest(mixedPost),
    error => error.code === "jdownloader-mixed-post-data",
  );
});

test("JDownloader capabilities are explicit and task-start aware", () => {
  assert.deepEqual(getJDownloaderCapabilities(), {
    post: true,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: true,
  });
});

const COMMAND_ID = "123e4567-e89b-42d3-a456-426614174000";
const ARIA2_ID = "123e4567-e89b-42d3-a456-426614174001";

function commandDownloader(overrides = {}) {
  return {
    id: COMMAND_ID,
    name: "Command",
    enabled: true,
    type: "command",
    command: {
      executablePath: "C:\\Tools\\downloader.exe",
      argumentsTemplate: "[URL]",
    },
    ...overrides,
  };
}

function aria2Downloader(overrides = {}) {
  return {
    id: ARIA2_ID,
    name: "aria2",
    enabled: true,
    type: "aria2",
    aria2: {
      rpcUrl: "http://127.0.0.1:6800/jsonrpc",
      secret: "secret",
      executablePath: "C:\\Tools\\aria2c.exe",
      configurationPath: "C:\\Tools\\aria2.conf",
      autoStart: false,
      startupArguments: "--continue=true",
      downloadDirectory: "D:\\Downloads",
    },
    ...overrides,
  };
}

test("downloader references preserve provider namespaces and migrate legacy names", () => {
  const ref = createDownloaderRef("custom", COMMAND_ID);
  assert.deepEqual(parseDownloaderRef(serializeDownloaderRef(ref)), ref);
  assert.deepEqual(parseDownloaderRef("Internet Download Manager"), {
    provider: "flashgot",
    id: "Internet Download Manager",
  });
});

test("custom downloader documents normalize supported entries", () => {
  const empty = createEmptyCustomDownloaderDocument();
  assert.deepEqual(empty, { version: 1, downloaders: [] });
  const normalized = validateCustomDownloaderDocument({
    version: 1,
    downloaders: [commandDownloader(), aria2Downloader()],
  });
  assert.equal(normalized.downloaders[0].command.argumentsTemplate, "[URL]");
  assert.equal(normalized.downloaders[0].startHidden, true);
  assert.equal(normalized.downloaders[1].aria2.secret, "secret");
  assert.equal(
    normalized.downloaders[1].aria2.configurationPath,
    "C:\\Tools\\aria2.conf",
  );
  assert.equal(normalized.downloaders[1].startHidden, true);
  const foreground = validateCustomDownloaderDocument({
    version: 1,
    downloaders: [commandDownloader({ startHidden: false })],
  });
  assert.equal(foreground.downloaders[0].startHidden, false);
  const serialized = stringifyCustomDownloaderDocument({
    version: 1,
    downloaders: [commandDownloader()],
  });
  assert.match(serialized, /\n  "downloaders": \[\n/);
  assert.equal(serialized.endsWith("\n"), true);
});

test("custom downloader documents reject duplicates and unsupported versions", () => {
  assert.throws(
    () => normalizeCustomDownloaderDocument({
      version: 1,
      downloaders: [commandDownloader(), commandDownloader({
        id: ARIA2_ID,
        name: "command",
      })],
    }),
    error => error instanceof CustomDownloaderConfigError &&
      error.code === "duplicate-name",
  );
  assert.throws(
    () => normalizeCustomDownloaderDocument({ version: 2, downloaders: [] }),
    error => error.code === "unsupported-version",
  );
});

test("argument tokenizer preserves quoted values without invoking a shell", () => {
  assert.deepEqual(
    tokenizeArguments('--flag "value with spaces" C:\\Tools\\file.exe'),
    ["--flag", "value with spaces", "C:\\Tools\\file.exe"],
  );
  assert.throws(
    () => tokenizeArguments('"unterminated'),
    error => error.code === "command-unterminated-quote",
  );
});

test("FlashGot-style placeholders expand scalar, fallback, and batch values", () => {
  assert.deepEqual(
    expandCommandTemplate(
      '--name "fixed value" [--referer=REFERER] [--cookie=COOKIE|--no-cookie] [ULIST]',
      {
        REFERER: "https://example.test/page",
        ULIST: ["https://example.test/a", "https://example.test/b"],
      },
    ),
    [
      "--name",
      "fixed value",
      "--referer=https://example.test/page",
      "--no-cookie",
      "https://example.test/a",
      "https://example.test/b",
    ],
  );
  assert.equal(commandTemplateUsesBatch("[UFILE]"), true);
  assert.equal(commandTemplateUsesBatch("[URL]"), false);
});

test("quoted placeholders remain one argv value and cannot inject arguments", () => {
  const hostileURL = "https://example.test/file name?value=--extra flag";
  assert.deepEqual(
    expandCommandTemplate('"[URL]" --url=[URL] [--header HEADERS]', {
      URL: hostileURL,
      HEADERS: "Cookie: session=value with spaces",
    }),
    [
      hostileURL,
      `--url=${hostileURL}`,
      "--header",
      "Cookie: session=value with spaces",
    ],
  );
});

test("every documented command placeholder expands through the safe argv path", () => {
  for (const name of COMMAND_PLACEHOLDERS) {
    const value = name === "ULIST" ? ["first", "second"] : `${name} value`;
    const expected = Array.isArray(value) ? value : [value];
    assert.deepEqual(expandCommandTemplate(`[${name}]`, { [name]: value }), expected);
  }
});

test("built-in command presets produce safe arguments for common downloaders", () => {
  assert.deepEqual(Object.keys(COMMAND_TEMPLATE_PRESETS), ["aria2c", "wget", "curl"]);
  const values = {
    URL: "https://example.test/file name.zip",
    FNAME: "file name.zip",
    REFERER: "https://example.test/page",
    COOKIE: "session=value with spaces",
    CFILE: "C:\\Temp\\cookies.txt",
    FOLDER: "D:\\Downloads",
    UA: "Browser Agent",
  };
  for (const template of Object.values(COMMAND_TEMPLATE_PRESETS)) {
    const args = expandCommandTemplate(template, values);
    assert.ok(args.includes(values.URL));
    assert.equal(args.includes("name.zip"), false);
  }
  assert.ok(expandCommandTemplate(COMMAND_TEMPLATE_PRESETS.aria2c, values).includes(
    "--load-cookies=C:\\Temp\\cookies.txt",
  ));
  assert.ok(expandCommandTemplate(COMMAND_TEMPLATE_PRESETS.curl, values).includes(
    "--cookie=session=value with spaces",
  ));
});

test("aria2 requests place secrets in actual calls and support multicall", () => {
  const config = aria2Downloader().aria2;
  const single = buildAria2Request([{
    url: "https://example.test/file.zip",
    filename: "file.zip",
    referer: "https://example.test/",
    userAgent: "Browser",
    cookies: "session=value",
  }], config, "single");
  assert.equal(single.method, "aria2.addUri");
  assert.equal(single.params[0], "token:secret");
  assert.equal(single.params[2].out, "file.zip");
  assert.deepEqual(single.params[2].header, ["Cookie: session=value"]);

  const multi = buildAria2Request([
    { url: "https://example.test/a" },
    { url: "magnet:?xt=urn:btih:test", filename: "ignored" },
  ], config, "multi");
  assert.equal(multi.method, "system.multicall");
  assert.equal(multi.params[0].length, 2);
  assert.equal(multi.params[0][0].params[0], "token:secret");
  assert.deepEqual(multi.params[0][1].params[2], { dir: "D:\\Downloads" });
});

test("aria2 response errors redact secrets and partial multicalls are counted", () => {
  assert.throws(
    () => inspectAria2Response({
      error: { message: "token secret was rejected" },
    }, 1, "secret"),
    error => error.code === "aria2-rpc-error" &&
      error.args.error === "token [redacted] was rejected",
  );
  assert.deepEqual(inspectAria2Response({
    result: [["gid-1"], { code: 1, message: "failed" }],
  }, 2), { succeeded: 1, failed: 1 });
});

test("aria2 startup arguments protect DownloadIt-managed RPC options", () => {
  const config = aria2Downloader().aria2;
  assert.deepEqual(buildAria2StartupArguments(config), [
    "--conf-path=C:\\Tools\\aria2.conf",
    "--continue=true",
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    "--rpc-listen-port=6800",
    "--rpc-secret=secret",
    "--dir=D:\\Downloads",
  ]);
  assert.throws(
    () => buildAria2StartupArguments({
      ...config,
      startupArguments: "--rpc-secret=override",
    }),
    error => error.code === "aria2-managed-argument",
  );
  assert.throws(
    () => buildAria2StartupArguments({
      ...config,
      startupArguments: "--conf-path=override.conf",
    }),
    error => error.code === "aria2-managed-argument",
  );
  assert.equal(isLoopbackAria2URL("http://127.0.0.2:6800/jsonrpc"), true);
  assert.throws(
    () => validateCustomDownloaderDocument({
      version: 1,
      downloaders: [aria2Downloader({
        aria2: {
          ...config,
          rpcUrl: "https://127.0.0.1:6800/jsonrpc",
          autoStart: true,
        },
      })],
    }),
    error => error.code === "aria2-autostart-local-only",
  );
});

test("provider registry keeps provider-local IDs separate", async () => {
  const calls = [];
  const registry = new DownloaderProviderRegistry([
    {
      provider: "flashgot",
      listDownloaders: () => [{ ref: { provider: "flashgot", id: "Same" } }],
      getDownloader: id => ({ provider: "flashgot", id }),
      download: async (id, task) => calls.push(["flashgot", id, task]),
    },
    {
      provider: "custom",
      listDownloaders: () => [{ ref: { provider: "custom", id: "Same" } }],
      getDownloader: id => ({ provider: "custom", id }),
      download: async (id, task, runtimeContext, options) =>
        calls.push(["custom", id, task, runtimeContext, options]),
    },
  ]);
  assert.equal(registry.listDownloaders().length, 2);
  const runtimeContext = { links: [{ browsingContextId: 7 }] };
  const options = { autoStartTask: false };
  await registry.download(
    { provider: "custom", id: "Same" },
    "task",
    runtimeContext,
    options,
  );
  assert.deepEqual(calls, [["custom", "Same", "task", runtimeContext, options]]);
});
