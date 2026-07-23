export const CUSTOM_DOWNLOADER_VERSION = 1;
export const FLASHGOT_PROVIDER = "flashgot";
export const CUSTOM_PROVIDER = "custom";
export const NATIVE_PROVIDER = "native";

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

  async download(ref, contexts) {
    const provider = this.providers.get(ref?.provider);
    if (!provider) {
      throw new Error(`Unknown downloader provider: ${ref?.provider || ""}`);
    }
    return provider.download(ref.id, contexts);
  }

  async refresh(name, options) {
    const provider = this.providers.get(name);
    if (!provider || typeof provider.refresh !== "function") {
      return [];
    }
    return provider.refresh(options);
  }
}
