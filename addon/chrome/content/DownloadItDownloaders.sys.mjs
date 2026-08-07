export const CUSTOM_DOWNLOADER_VERSION = 1;
export const FLASHGOT_PROVIDER = "flashgot";
export const CUSTOM_PROVIDER = "custom";
export const JDOWNLOADER_PROVIDER = "jdownloader";
export const JDOWNLOADER_DOWNLOADER_ID = "jdownloader";
export const JDOWNLOADER_DEFAULT_ENDPOINT =
  "http://127.0.0.1:9666/flashgot";
export const ABDM_PROVIDER = "abdm";
export const ABDM_DOWNLOADER_ID = "abdm";
export const ABDM_DEFAULT_ENDPOINT = "http://127.0.0.1:15151/";
export const XDM_PROVIDER = "xdm";
export const XDM_DOWNLOADER_ID = "xdm";
export const XDM_ENDPOINT = "http://127.0.0.1:8597/";
export const UGET_PROVIDER = "uget";
export const UGET_DOWNLOADER_ID = "uget";
export const ARIA2NEXT_PROVIDER = "aria2next";
export const ARIA2NEXT_DOWNLOADER_ID = "aria2next";
export const ARIA2NEXT_DEFAULT_RPC_PORT = 6800;
export const NATIVE_PROVIDER = "native";
export const NATIVE_DOWNLOADER_ID = "firefox";

export const BUILT_IN_PROTOCOLS = Object.freeze([
  Object.freeze({
    id: JDOWNLOADER_PROVIDER,
    provider: JDOWNLOADER_PROVIDER,
    downloaderId: JDOWNLOADER_DOWNLOADER_ID,
    name: "JDownloader",
    singleton: true,
  }),
  Object.freeze({
    id: ABDM_PROVIDER,
    provider: ABDM_PROVIDER,
    downloaderId: ABDM_DOWNLOADER_ID,
    name: "AB Download Manager",
    singleton: true,
  }),
  Object.freeze({
    id: XDM_PROVIDER,
    provider: XDM_PROVIDER,
    downloaderId: XDM_DOWNLOADER_ID,
    name: "Xtreme Download Manager",
    singleton: true,
  }),
  Object.freeze({
    id: UGET_PROVIDER,
    provider: UGET_PROVIDER,
    downloaderId: UGET_DOWNLOADER_ID,
    name: "uGet",
    singleton: true,
  }),
  Object.freeze({
    id: ARIA2NEXT_PROVIDER,
    provider: ARIA2NEXT_PROVIDER,
    downloaderId: ARIA2NEXT_DOWNLOADER_ID,
    name: "Aria2Next",
    singleton: true,
  }),
]);

export const DOWNLOADER_CAPABILITY_KEYS = Object.freeze([
  "post",
  "cookies",
  "batch",
  "directory",
  "taskStart",
]);

const FLASHGOT_DEFAULT_CAPABILITIES = Object.freeze({
  post: null,
  cookies: null,
  batch: null,
  directory: false,
  taskStart: false,
});

// These describe the current Grabby-FlashGot bridge, not the applications in
// isolation. In particular, its JSON protocol has no download-directory field.
const FLASHGOT_CAPABILITIES = Object.freeze({
  "AB Download Manager": { post: false, cookies: true, batch: true },
  BitComet: { post: false, cookies: false, batch: true },
  "Download Accelerator Plus": { post: false, cookies: true, batch: true },
  "Download Accelerator Manager": { post: true, cookies: true, batch: true },
  "Download Master": { post: false, cookies: true, batch: true },
  EagleGet: { post: true, cookies: true, batch: true },
  FlareGet: { post: true, cookies: true, batch: false },
  FlashGet: { post: false, cookies: true, batch: true },
  "FlashGet 2": { post: false, cookies: true, batch: true },
  "FlashGet 2.x": { post: false, cookies: true, batch: true },
  "Free Download Manager": { post: false, cookies: true, batch: true },
  "Free Download Manager 3": { post: false, cookies: true, batch: true },
  FreshDownload: { post: false, cookies: true, batch: true },
  GetGo: { post: false, cookies: false, batch: true },
  GetRight: { post: false, cookies: true, batch: true },
  GigaGet: { post: false, cookies: true, batch: true },
  InstantGet: { post: false, cookies: true, batch: true },
  "Internet Download Accelerator": { post: false, cookies: true, batch: true },
  "Internet Download Manager": { post: true, cookies: true, batch: true },
  LeechGet: { post: false, cookies: true, batch: false },
  "LeechGet 2002": { post: false, cookies: true, batch: false },
  "Mass Downloader": { post: false, cookies: true, batch: true },
  NetAnts: { post: false, cookies: true, batch: true },
  "Neat Download Manager": { post: true, cookies: true, batch: true },
  ReGet: { post: true, cookies: true, batch: true },
  "ReGet(Legacy)": { post: true, cookies: true, batch: true },
  "Star Downloader": { post: false, cookies: false, batch: true },
  Thunder: { post: false, cookies: true, batch: true },
  "Thunder (Old)": { post: false, cookies: true, batch: true },
  TrueDownloader: { post: false, cookies: true, batch: true },
  "wxDownload Fast": { post: false, cookies: false, batch: true },
});

export function normalizeDownloaderCapabilities(value = {}) {
  const normalized = {};
  for (const key of DOWNLOADER_CAPABILITY_KEYS) {
    normalized[key] = typeof value?.[key] === "boolean" ? value[key] : null;
  }
  return normalized;
}

export function getFlashGotDownloaderCapabilities(name) {
  const values = FLASHGOT_CAPABILITIES[String(name || "")];
  if (!values) {
    return normalizeDownloaderCapabilities(FLASHGOT_DEFAULT_CAPABILITIES);
  }
  return normalizeDownloaderCapabilities({
    ...values,
    directory: false,
    taskStart: false,
  });
}

export function getCustomDownloaderCapabilities(downloader) {
  if (downloader?.type === "aria2") {
    return normalizeDownloaderCapabilities({
      post: false,
      cookies: true,
      batch: true,
      directory: true,
      taskStart: false,
    });
  }
  if (downloader?.type !== "command") {
    return normalizeDownloaderCapabilities();
  }

  const placeholders = new Set(findCommandPlaceholders(
    downloader.command?.argumentsTemplate,
  ));
  return normalizeDownloaderCapabilities({
    post: placeholders.has("POST") || placeholders.has("RAWPOST"),
    cookies: placeholders.has("COOKIE") || placeholders.has("CFILE") ||
      placeholders.has("HEADERS"),
    batch: true,
    directory: placeholders.has("FOLDER"),
    taskStart: false,
  });
}

export function getNativeDownloaderCapabilities() {
  return normalizeDownloaderCapabilities({
    post: true,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: false,
  });
}

export class JDownloaderConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "JDownloaderConfigError";
    this.code = code;
    this.args = args;
  }
}

export function getJDownloaderCapabilities() {
  return normalizeDownloaderCapabilities({
    post: true,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: true,
  });
}

export class ABDMConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "ABDMConfigError";
    this.code = code;
    this.args = args;
  }
}

export function getABDMCapabilities() {
  return normalizeDownloaderCapabilities({
    post: false,
    cookies: true,
    batch: true,
    directory: false,
    taskStart: true,
  });
}

export class XDMConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "XDMConfigError";
    this.code = code;
    this.args = args;
  }
}

export function getXDMCapabilities() {
  return normalizeDownloaderCapabilities({
    post: false,
    cookies: true,
    batch: true,
    directory: false,
    taskStart: false,
  });
}

export class UGetConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "UGetConfigError";
    this.code = code;
    this.args = args;
  }
}

export function getUGetCapabilities() {
  return normalizeDownloaderCapabilities({
    post: true,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: false,
  });
}

export class Aria2NextConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "Aria2NextConfigError";
    this.code = code;
    this.args = args;
  }
}

export function getAria2NextCapabilities() {
  return normalizeDownloaderCapabilities({
    post: false,
    cookies: true,
    batch: true,
    directory: true,
    taskStart: false,
  });
}

function uGetOptionValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

export function buildUGetArguments(job, { directory = "" } = {}) {
  const links = Array.isArray(job?.links) ? job.links : [];
  if (!links.length) {
    throw new UGetConfigError("uget-submit-failed");
  }

  const folder = uGetOptionValue(directory);
  const referer = uGetOptionValue(job.referer);
  const userAgent = uGetOptionValue(job.useragent);
  return links.map(link => {
    const url = String(link?.url || "").trim();
    if (!url) {
      throw new UGetConfigError("uget-submit-failed");
    }
    const argumentsList = ["--quiet"];
    const append = (flag, value) => {
      if (value) {
        argumentsList.push(`${flag}=${value}`);
      }
    };
    append("--folder", folder);
    append("--filename", uGetOptionValue(link.filename || link.desc));
    append("--http-referer", referer);
    append("--http-user-agent", userAgent);
    append("--http-cookie-data", uGetOptionValue(link.cookies));
    const postData = String(link.postdata || "");
    if (postData) {
      append("--http-post-data", postData);
    }
    argumentsList.push(url);
    return argumentsList;
  });
}

function xdmHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function buildXDMItem(job, link, { includeFilename = false } = {}) {
  const requestHeaders = {};
  const cookie = xdmHeaderValue(link.cookies);
  const referer = xdmHeaderValue(job.referer);
  const userAgent = xdmHeaderValue(job.useragent);
  if (userAgent) {
    requestHeaders["User-Agent"] = [userAgent];
  }
  if (referer) {
    requestHeaders.Referer = [referer];
  }
  const item = {
    url: String(link.url || ""),
    cookie: cookie || undefined,
    requestHeaders,
    responseHeaders: {},
  };
  if (includeFilename) {
    item.filename = xdmHeaderValue(link.filename || link.desc) || undefined;
  }
  return item;
}

export function buildXDMRequest(job) {
  const links = Array.isArray(job?.links) ? job.links : [];
  if (!links.length) {
    throw new XDMConfigError("xdm-submit-failed");
  }
  if (links.some(link => String(link.postdata || ""))) {
    throw new XDMConfigError("xdm-post-unsupported");
  }
  if (links.length === 1) {
    return {
      path: "download",
      body: buildXDMItem(job, links[0], { includeFilename: true }),
    };
  }
  return {
    path: "link",
    body: links.map(link => buildXDMItem(job, link)),
  };
}

export function normalizeABDMEndpoint(value = ABDM_DEFAULT_ENDPOINT) {
  const input = String(value).trim();
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new ABDMConfigError("abdm-endpoint-invalid");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipv4 = hostname.split(".");
  const loopbackIPv4 = ipv4.length === 4 && ipv4[0] === "127" &&
    ipv4.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const loopback = hostname === "localhost" || loopbackIPv4 || hostname === "::1";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (
    url.protocol !== "http:" ||
    !loopback ||
    input.includes("@") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    path !== "/"
  ) {
    throw new ABDMConfigError("abdm-endpoint-invalid");
  }
  url.pathname = "/";
  return url.href;
}

function abdmHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

export function buildABDMRequest(job, { autoStartTask = true } = {}) {
  const links = Array.isArray(job?.links) ? job.links : [];
  if (!links.length) {
    throw new ABDMConfigError("abdm-submit-failed");
  }
  if (links.some(link => String(link.postdata || ""))) {
    throw new ABDMConfigError("abdm-post-unsupported");
  }

  const downloadPage = abdmHeaderValue(job.dlpageReferer || job.referer);
  return {
    items: links.map(link => {
      const headers = {};
      const cookie = abdmHeaderValue(link.cookies);
      const referer = abdmHeaderValue(job.referer);
      const userAgent = abdmHeaderValue(job.useragent);
      if (cookie) {
        headers.Cookie = cookie;
      }
      if (referer) {
        headers.Referer = referer;
      }
      if (userAgent) {
        headers["User-Agent"] = userAgent;
      }
      return {
        link: String(link.url || ""),
        headers,
        downloadPage: downloadPage || "",
        suggestedName: abdmHeaderValue(link.filename || link.desc) || "",
      };
    }),
    options: {
      silentAdd: true,
      silentStart: Boolean(autoStartTask),
    },
  };
}

export function normalizeJDownloaderEndpoint(
  value = JDOWNLOADER_DEFAULT_ENDPOINT,
) {
  const input = String(value).trim();
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new JDownloaderConfigError("jdownloader-endpoint-invalid");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipv4 = hostname.split(".");
  const loopbackIPv4 = ipv4.length === 4 && ipv4[0] === "127" &&
    ipv4.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const loopback = hostname === "localhost" || loopbackIPv4 || hostname === "::1";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (
    url.protocol !== "http:" ||
    !loopback ||
    input.includes("@") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (path !== "/" && path !== "/flashgot")
  ) {
    throw new JDownloaderConfigError("jdownloader-endpoint-invalid");
  }
  url.pathname = "/flashgot";
  return url.href;
}

export function getJDownloaderReferer(value = JDOWNLOADER_DEFAULT_ENDPOINT) {
  const url = new URL(normalizeJDownloaderEndpoint(value));
  url.hostname = "localhost";
  return url.href;
}

const JDOWNLOADER_VM_ARGUMENT = /^-Xm[sx]\d{1,6}[kKmMgG]?$/;

export function normalizeJDownloaderJavaArguments(value) {
  const values = Array.isArray(value) ? value : [];
  if (!values.every(argument =>
    typeof argument === "string" && JDOWNLOADER_VM_ARGUMENT.test(argument)
  )) {
    throw new JDownloaderConfigError("jdownloader-discovery-invalid");
  }
  return [...values];
}

export function parseJDownloaderDiscoveryResponse(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length !== 2) {
    throw new JDownloaderConfigError("jdownloader-discovery-invalid");
  }

  const pathLine = lines[0];
  const quotedPath = pathLine.startsWith('"') && pathLine.endsWith('"');
  if (pathLine.startsWith('"') !== pathLine.endsWith('"')) {
    throw new JDownloaderConfigError("jdownloader-discovery-invalid");
  }
  const path = quotedPath ? pathLine.slice(1, -1) : pathLine;
  if (
    !/^(?:(?:[A-Za-z]:[\\/])|(?:\\\\)|(?:\/))/.test(path) ||
    !/\.jar$/i.test(path)
  ) {
    throw new JDownloaderConfigError("jdownloader-discovery-invalid");
  }

  const command = lines[1];
  const commandPath = `"${path}"`;
  let prefix = "";
  if (command.endsWith(commandPath)) {
    prefix = command.slice(0, -commandPath.length).trim();
  } else if (command.endsWith(path)) {
    prefix = command.slice(0, -path.length).trim();
  } else {
    throw new JDownloaderConfigError("jdownloader-discovery-invalid");
  }
  const match = /^(?:javaw?|javaw?\.exe)\s+(.*?)\s*-jar$/i.exec(prefix);
  if (!match) {
    throw new JDownloaderConfigError("jdownloader-discovery-invalid");
  }
  const javaArguments = match[1]
    ? match[1].trim().split(/\s+/).filter(Boolean)
    : [];
  normalizeJDownloaderJavaArguments(javaArguments);
  return {
    path: /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path)
      ? path.replace(/\//g, "\\")
      : path,
    javaArguments,
  };
}

export function validateJDownloaderLaunchPath(value, platform = "windows") {
  const path = String(value || "").trim();
  if (
    path &&
    platform !== "linux" &&
    !path.startsWith("/") &&
    !/\.(?:exe|jar)$/i.test(path)
  ) {
    throw new JDownloaderConfigError("jdownloader-launch-path-invalid");
  }
  return path;
}

function jDownloaderLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

export function buildJDownloaderRequest(job, {
  autoStartTask = true,
  directory = "",
  packageName = "DownloadIt",
} = {}) {
  const links = Array.isArray(job?.links) ? job.links : [];
  if (!links.length) {
    throw new JDownloaderConfigError("jdownloader-submit-failed");
  }
  const postDataValues = new Set(links.map(link => String(link.postdata || "")));
  if (postDataValues.size > 1) {
    throw new JDownloaderConfigError("jdownloader-mixed-post-data");
  }

  const params = new URLSearchParams();
  params.set("autostart", autoStartTask ? "1" : "0");
  params.set("package", String(packageName || "DownloadIt"));
  const referer = String(job.referer || job.dlpageReferer || "");
  if (referer) {
    params.set("referer", referer);
  }
  if (directory) {
    params.set("dir", String(directory));
  }
  const postData = [...postDataValues][0] || "";
  if (postData) {
    params.set("postData", postData);
  }
  params.set("urls", links.map(link => String(link.url || "")).join("\n"));
  params.set(
    "descriptions",
    links.map(link => jDownloaderLine(link.desc)).join("\n"),
  );
  params.set(
    "fnames",
    links.map(link => jDownloaderLine(link.filename)).join("\n"),
  );

  const cookieValues = new Set(links.map(link => String(link.cookies || "")));
  if (cookieValues.size === 1) {
    const cookies = [...cookieValues][0];
    if (cookies) {
      params.set("cookies", cookies);
    }
  }
  return params.toString();
}

export function isNativeDownloadURL(value) {
  try {
    const protocol = new URL(String(value || "")).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function getNativeDownloadFilenameCandidate(link = {}) {
  const explicit = String(link.filename || "").trim();
  if (explicit) {
    return explicit;
  }
  try {
    const pathname = new URL(String(link.url || "")).pathname;
    const segment = pathname.split("/").filter(Boolean).at(-1) || "";
    if (segment) {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    }
  } catch {}
  return "download";
}

export const COMMAND_PLACEHOLDERS = Object.freeze([
  "URL",
  "FNAME",
  "COMMENT",
  "REFERER",
  "COOKIE",
  "CFILE",
  "FOLDER",
  "POST",
  "RAWPOST",
  "HEADERS",
  "ULIST",
  "UFILE",
  "USERPASS",
  "UA",
]);

export const COMMAND_TEMPLATE_PRESETS = Object.freeze({
  aria2c: "--continue=true --auto-file-renaming=false [--dir=FOLDER] [--out=FNAME] [--referer=REFERER] [--user-agent=UA] [--load-cookies=CFILE] [URL]",
  wget: "--continue --content-disposition [--directory-prefix=FOLDER] [--referer=REFERER] [--user-agent=UA] [--load-cookies=CFILE] [URL]",
  curl: "--location --continue-at=- [--output-dir=FOLDER] [--output=FNAME|--remote-name] [--referer=REFERER] [--user-agent=UA] [--cookie=COOKIE] [URL]",
});

const COMMAND_PLACEHOLDER_PATTERN = new RegExp(
  `\\b(${COMMAND_PLACEHOLDERS.join("|")})\\b`,
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGED_ARIA2_ARGUMENT =
  /^--(?:conf-path|enable-rpc|rpc-listen-all|rpc-listen-port|rpc-secret|dir)(?:=|$)/i;

export class CustomDownloaderConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "CustomDownloaderConfigError";
    this.code = code;
    this.args = args;
  }
}

export function createEmptyCustomDownloaderDocument() {
  return {
    version: CUSTOM_DOWNLOADER_VERSION,
    downloaders: [],
  };
}

export function createDownloaderRef(provider, id) {
  const normalizedProvider = String(provider || "").trim();
  const normalizedId = String(id || "").trim();
  if (!normalizedProvider || !normalizedId) {
    throw new TypeError("A downloader provider and ID are required");
  }
  return { provider: normalizedProvider, id: normalizedId };
}

export function serializeDownloaderRef(ref) {
  const normalized = createDownloaderRef(ref?.provider, ref?.id);
  return JSON.stringify(normalized);
}

export function downloaderRefKey(ref) {
  return serializeDownloaderRef(ref);
}

export function parseDownloaderRef(value, legacyProvider = FLASHGOT_PROVIDER) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.provider === "string" &&
      typeof parsed.id === "string"
    ) {
      return createDownloaderRef(parsed.provider, parsed.id);
    }
  } catch {}
  return createDownloaderRef(legacyProvider, raw);
}

export function normalizeCustomDownloaderDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CustomDownloaderConfigError("invalid-root");
  }
  if (value.version !== CUSTOM_DOWNLOADER_VERSION) {
    throw new CustomDownloaderConfigError("unsupported-version", {
      version: value.version,
    });
  }
  if (!Array.isArray(value.downloaders)) {
    throw new CustomDownloaderConfigError("invalid-downloaders");
  }

  const names = new Set();
  const ids = new Set();
  const downloaders = value.downloaders.map((entry, index) => {
    const downloader = normalizeCustomDownloader(entry, index);
    const normalizedName = downloader.name.toLocaleLowerCase("en-US");
    if (names.has(normalizedName)) {
      throw new CustomDownloaderConfigError("duplicate-name", {
        name: downloader.name,
      });
    }
    if (ids.has(downloader.id)) {
      throw new CustomDownloaderConfigError("duplicate-id", {
        id: downloader.id,
      });
    }
    names.add(normalizedName);
    ids.add(downloader.id);
    return downloader;
  });

  return {
    version: CUSTOM_DOWNLOADER_VERSION,
    downloaders,
  };
}

export function validateCustomDownloaderDocument(value) {
  const normalized = normalizeCustomDownloaderDocument(value);
  for (const downloader of normalized.downloaders) {
    if (downloader.name.length > 80) {
      throw new CustomDownloaderConfigError("name-too-long", {
        name: downloader.name,
      });
    }
    if (downloader.type === "command") {
      if (!downloader.command.executablePath) {
        throw new CustomDownloaderConfigError("command-path-required", {
          name: downloader.name,
        });
      }
      const placeholders = findCommandPlaceholders(
        downloader.command.argumentsTemplate,
      );
      if (!placeholders.some(name => ["URL", "ULIST", "UFILE"].includes(name))) {
        throw new CustomDownloaderConfigError("command-url-required", {
          name: downloader.name,
        });
      }
      expandCommandTemplate(downloader.command.argumentsTemplate, {
        URL: "https://example.invalid/file",
        ULIST: ["https://example.invalid/file"],
        UFILE: "C:\\Temp\\urls.txt",
      });
    } else {
      validateAria2Configuration(downloader.aria2, downloader.name);
    }
  }
  return normalized;
}

export function stringifyCustomDownloaderDocument(value) {
  return `${JSON.stringify(validateCustomDownloaderDocument(value), null, 2)}\n`;
}

function normalizeCustomDownloader(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new CustomDownloaderConfigError("invalid-entry", { index });
  }
  const id = String(entry.id || "").trim();
  const name = String(entry.name || "").trim();
  const type = String(entry.type || "").trim();
  if (!UUID_PATTERN.test(id)) {
    throw new CustomDownloaderConfigError("invalid-id", { index });
  }
  if (!name) {
    throw new CustomDownloaderConfigError("name-required", { index });
  }
  if (type !== "command" && type !== "aria2") {
    throw new CustomDownloaderConfigError("invalid-type", { name });
  }

  const base = {
    id: id.toLowerCase(),
    name,
    enabled: entry.enabled !== false,
    type,
    startHidden: entry.startHidden !== false,
  };
  if (type === "command") {
    const command = entry.command && typeof entry.command === "object"
      ? entry.command
      : {};
    return {
      ...base,
      command: {
        executablePath: String(command.executablePath || "").trim(),
        argumentsTemplate: String(command.argumentsTemplate || "[URL]"),
      },
    };
  }

  const aria2 = entry.aria2 && typeof entry.aria2 === "object"
    ? entry.aria2
    : {};
  return {
    ...base,
    aria2: {
      rpcUrl: String(
        aria2.rpcUrl || "http://127.0.0.1:6800/jsonrpc",
      ).trim(),
      secret: String(aria2.secret || ""),
      executablePath: String(aria2.executablePath || "").trim(),
      configurationPath: String(aria2.configurationPath || "").trim(),
      autoStart: aria2.autoStart === true,
      startupArguments: String(aria2.startupArguments || ""),
      downloadDirectory: String(aria2.downloadDirectory || "").trim(),
    },
  };
}

function validateAria2Configuration(config, name = "") {
  let url;
  try {
    url = new URL(config.rpcUrl);
  } catch {
    throw new CustomDownloaderConfigError("aria2-url-invalid", { name });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CustomDownloaderConfigError("aria2-url-invalid", { name });
  }
  if (config.autoStart) {
    if (!config.executablePath) {
      throw new CustomDownloaderConfigError("aria2-path-required", { name });
    }
    if (!isLoopbackAria2URL(config.rpcUrl) || url.protocol !== "http:") {
      throw new CustomDownloaderConfigError("aria2-autostart-local-only", {
        name,
      });
    }
    buildAria2StartupArguments(config);
  }
}

export function cloneCustomDownloaderDocument(value) {
  return normalizeCustomDownloaderDocument(JSON.parse(JSON.stringify(value)));
}

export function findCommandPlaceholders(template) {
  const names = [];
  const seen = new Set();
  for (const match of String(template || "").matchAll(/\[([^\]]*)\]/g)) {
    const placeholder = match[1].match(COMMAND_PLACEHOLDER_PATTERN)?.[1];
    if (placeholder && !seen.has(placeholder)) {
      seen.add(placeholder);
      names.push(placeholder);
    }
  }
  return names;
}

export function commandTemplateUsesBatch(template) {
  const placeholders = findCommandPlaceholders(template);
  return placeholders.includes("ULIST") || placeholders.includes("UFILE");
}

export function tokenizeArguments(value) {
  const input = String(value || "");
  const tokens = [];
  let token = "";
  let quote = "";
  let tokenStarted = false;

  const commit = () => {
    if (tokenStarted) {
      tokens.push(token);
      token = "";
      tokenStarted = false;
    }
  };

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quote) {
      if (character === quote) {
        quote = "";
      } else if (
        character === "\\" &&
        (input[index + 1] === quote || input[index + 1] === "\\")
      ) {
        token += input[++index];
      } else {
        token += character;
      }
      tokenStarted = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      tokenStarted = true;
    } else if (/\s/.test(character)) {
      commit();
    } else if (
      character === "\\" &&
      input[index + 1] &&
      /[\s"'\\]/.test(input[index + 1])
    ) {
      token += input[++index];
      tokenStarted = true;
    } else {
      token += character;
      tokenStarted = true;
    }
  }
  if (quote) {
    throw new CustomDownloaderConfigError("command-unterminated-quote");
  }
  commit();
  return tokens;
}

export function expandCommandTemplate(template, values = {}) {
  const input = String(template || "");
  const groups = [];
  const protectedInput = input.replace(/\[([^\]]*)\]/g, (match, group) => {
    const index = groups.push(group) - 1;
    return `\uE000${index}\uE001`;
  });
  const argumentsList = [];
  for (const token of tokenizeArguments(protectedInput)) {
    argumentsList.push(...expandTemplateToken(token, groups, values));
  }
  return argumentsList;
}

function expandTemplateToken(token, groups, values) {
  const markerPattern = /\uE000(\d+)\uE001/g;
  const matches = [...token.matchAll(markerPattern)];
  if (!matches.length) {
    return [token];
  }
  if (matches.length === 1 && matches[0][0] === token) {
    return expandPlaceholderGroup(groups[Number(matches[0][1])], values);
  }

  let variants = [""];
  let offset = 0;
  for (const match of matches) {
    const literal = token.slice(offset, match.index);
    const replacements = expandPlaceholderGroup(
      groups[Number(match[1])],
      values,
    );
    if (!replacements.length) {
      return [];
    }
    variants = variants.flatMap(prefix =>
      replacements.map(replacement => `${prefix}${literal}${replacement}`)
    );
    offset = match.index + match[0].length;
  }
  const trailing = token.slice(offset);
  return variants.map(value => `${value}${trailing}`);
}

function expandPlaceholderGroup(group, values) {
  const match = group.match(COMMAND_PLACEHOLDER_PATTERN);
  if (!match) {
    throw new CustomDownloaderConfigError("command-placeholder-invalid", {
      placeholder: group,
    });
  }
  const name = match[1];
  const placeholderIndex = match.index;
  const before = group.slice(0, placeholderIndex);
  const after = group.slice(placeholderIndex + name.length);
  const value = values[name];
  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (!hasValue) {
    return after.startsWith("|") ? tokenizeArguments(after.slice(1)) : [];
  }

  const beforeMatch = before.match(/^([\s\S]*?)(\S*)$/);
  const afterMatch = after.match(/^(\S*)([\s\S]*)$/);
  const leading = tokenizeArguments(beforeMatch[1]);
  const prefix = beforeMatch[2];
  const suffix = afterMatch[1].startsWith("|") ? "" : afterMatch[1];
  const trailing = afterMatch[1].startsWith("|")
    ? []
    : tokenizeArguments(afterMatch[2]);

  if (Array.isArray(value)) {
    return [
      ...leading,
      ...(prefix ? [prefix] : []),
      ...value.map(item => String(item)),
      ...(suffix ? [suffix] : []),
      ...trailing,
    ];
  }
  return [
    ...leading,
    `${prefix}${String(value)}${suffix}`,
    ...trailing,
  ];
}

export function isLoopbackAria2URL(value) {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname.startsWith("127.") || hostname === "::1";
  } catch {
    return false;
  }
}

export function redactAria2Secret(value, secret) {
  const text = String(value || "");
  const token = String(secret || "");
  return token ? text.split(token).join("[redacted]") : text;
}

export function buildAria2StartupArguments(
  config,
  configurationPath = config.configurationPath,
) {
  validateAria2Configuration({ ...config, autoStart: false });
  const url = new URL(config.rpcUrl);
  const extras = tokenizeArguments(config.startupArguments);
  const managed = extras.find(argument => MANAGED_ARIA2_ARGUMENT.test(argument));
  if (managed) {
    throw new CustomDownloaderConfigError("aria2-managed-argument", {
      argument: managed.split("=", 1)[0],
    });
  }
  const argumentsList = [
    ...(configurationPath ? [`--conf-path=${configurationPath}`] : []),
    ...extras,
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    `--rpc-listen-port=${url.port || "6800"}`,
  ];
  if (config.secret) {
    argumentsList.push(`--rpc-secret=${config.secret}`);
  }
  if (config.downloadDirectory) {
    argumentsList.push(`--dir=${config.downloadDirectory}`);
  }
  return argumentsList;
}

export function buildAria2NextStartupArguments(config, downloadDirectory = "") {
  const extras = tokenizeArguments(config.extraArgs);
  const managed = extras.find(argument => MANAGED_ARIA2_ARGUMENT.test(argument));
  if (managed) {
    throw new CustomDownloaderConfigError("aria2-managed-argument", {
      argument: managed.split("=", 1)[0],
    });
  }
  const argumentsList = [
    ...extras,
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    `--rpc-listen-port=${config.rpcPort}`,
  ];
  if (config.secret) {
    argumentsList.push(`--rpc-secret=${config.secret}`);
  }
  if (downloadDirectory) {
    argumentsList.push(`--dir=${downloadDirectory}`);
  }
  return argumentsList;
}

export function buildAria2AddUriCall(link, config, includeToken = true) {
  const url = String(link?.url || "");
  const protocol = new URL(url).protocol;
  const options = {};
  if (config.downloadDirectory) {
    options.dir = config.downloadDirectory;
  }
  if (protocol !== "magnet:") {
    if (link.filename) {
      options.out = String(link.filename);
    }
    if (link.referer) {
      options.referer = String(link.referer);
    }
    if (link.userAgent) {
      options["user-agent"] = String(link.userAgent);
    }
    if (link.cookies) {
      options.header = [`Cookie: ${link.cookies}`];
    }
  }
  const params = [];
  if (includeToken && config.secret) {
    params.push(`token:${config.secret}`);
  }
  params.push([url], options);
  return {
    methodName: "aria2.addUri",
    params,
  };
}

export function buildAria2Request(links, config, requestId) {
  if (!Array.isArray(links) || links.length === 0) {
    throw new TypeError("At least one aria2 link is required");
  }
  const id = String(requestId || `downloadit-${Date.now()}`);
  if (links.length === 1) {
    const call = buildAria2AddUriCall(links[0], config);
    return {
      jsonrpc: "2.0",
      id,
      method: call.methodName,
      params: call.params,
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    method: "system.multicall",
    params: [[...links.map(link => buildAria2AddUriCall(link, config))]],
  };
}

export function inspectAria2Response(response, expectedCount = 1, secret = "") {
  if (!response || typeof response !== "object") {
    throw new CustomDownloaderConfigError("aria2-response-invalid");
  }
  if (response.error) {
    throw new CustomDownloaderConfigError("aria2-rpc-error", {
      error: redactAria2Secret(
        response.error.message || response.error.code || "",
        secret,
      ),
    });
  }
  if (expectedCount <= 1) {
    return { succeeded: response.result ? 1 : 0, failed: response.result ? 0 : 1 };
  }
  const results = Array.isArray(response.result) ? response.result : [];
  const succeeded = results.filter(result => Array.isArray(result) && result[0]).length;
  const failed = expectedCount - succeeded;
  return { succeeded, failed };
}

export class DownloaderProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map();
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider) {
    const name = String(provider?.provider || "").trim();
    if (
      !name ||
      typeof provider.listDownloaders !== "function" ||
      typeof provider.getDownloader !== "function" ||
      typeof provider.download !== "function"
    ) {
      throw new TypeError("Invalid downloader provider");
    }
    if (this.providers.has(name)) {
      throw new TypeError(`Downloader provider already registered: ${name}`);
    }
    this.providers.set(name, provider);
    return provider;
  }

  listDownloaders() {
    return [...this.providers.values()].flatMap(provider =>
      provider.listDownloaders()
    );
  }

  getDownloader(ref) {
    return this.providers.get(ref?.provider)?.getDownloader(ref.id) || null;
  }

  async download(ref, task, runtimeContext = null, options = {}) {
    const provider = this.providers.get(ref?.provider);
    if (!provider) {
      throw new Error(`Unknown downloader provider: ${ref?.provider || ""}`);
    }
    return provider.download(ref.id, task, runtimeContext, options);
  }

  async refresh(name, options) {
    const provider = this.providers.get(name);
    if (!provider || typeof provider.refresh !== "function") {
      return [];
    }
    return provider.refresh(options);
  }
}
