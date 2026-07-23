import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAria2Request,
  buildAria2StartupArguments,
  COMMAND_PLACEHOLDERS,
  COMMAND_TEMPLATE_PRESETS,
  commandTemplateUsesBatch,
  createDownloaderRef,
  createEmptyCustomDownloaderDocument,
  CustomDownloaderConfigError,
  DownloaderProviderRegistry,
  expandCommandTemplate,
  inspectAria2Response,
  isLoopbackAria2URL,
  normalizeCustomDownloaderDocument,
  parseDownloaderRef,
  serializeDownloaderRef,
  stringifyCustomDownloaderDocument,
  tokenizeArguments,
  validateCustomDownloaderDocument,
} from "../addon/chrome/content/DownloadItDownloaders.sys.mjs";

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
      download: async (id, task) => calls.push(["custom", id, task]),
    },
  ]);
  assert.equal(registry.listDownloaders().length, 2);
  await registry.download({ provider: "custom", id: "Same" }, "task");
  assert.deepEqual(calls, [["custom", "Same", "task"]]);
});
