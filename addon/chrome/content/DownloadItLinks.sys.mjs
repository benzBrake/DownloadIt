import {
  classifyDownloadTarget,
  DOWNLOAD_TARGET_CLASSIFICATION,
} from "./DownloadItProtocol.sys.mjs";

export const PAGE_LINKS_QUERY = "DownloadIt:GetPageLinks";
export const LINKS_DIALOG_URL = "chrome://downloadit/content/links.xhtml";
export const LINK_TYPE_VALUES = [
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "program",
  "other",
];

export const BUILT_IN_LINK_GROUP_KEYS = [
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "program",
];

const LINK_GROUP_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LINK_EXTENSION_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const RESERVED_LINK_GROUP_KEYS = new Set([...BUILT_IN_LINK_GROUP_KEYS, "other"]);

const BUILT_IN_LINK_GROUP_EXTENSIONS = new Map([
  ["image", [
    "avif", "bmp", "gif", "heic", "heif", "ico", "jfif", "jpeg", "jpg",
    "png", "svg", "tif", "tiff", "webp",
  ]],
  ["video", [
    "3gp", "avi", "flv", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg",
    "mpg", "ogv", "ts", "webm", "wmv",
  ]],
  ["audio", [
    "aac", "flac", "m4a", "mid", "midi", "mp3", "oga", "ogg", "opus",
    "wav", "wma",
  ]],
  ["document", [
    "csv", "doc", "docx", "epub", "md", "odp", "ods", "odt", "pdf",
    "ppt", "pptx", "rtf", "txt", "xls", "xlsx",
  ]],
  ["archive", [
    "7z", "bz2", "gz", "iso", "rar", "tar", "tgz", "xz", "zip", "zst",
  ]],
  ["program", [
    "apk", "appx", "deb", "dmg", "exe", "msi", "msix", "pkg", "rpm", "xpi",
  ]],
]);

export class LinkGroupValidationError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "LinkGroupValidationError";
    this.code = code;
    this.args = args;
  }
}

export function createDefaultLinkGroupSettings() {
  return {
    version: 1,
    groups: BUILT_IN_LINK_GROUP_KEYS.map(key => ({
      key,
      builtIn: true,
      enabled: true,
      extensions: [...BUILT_IN_LINK_GROUP_EXTENSIONS.get(key)],
    })),
  };
}

function normalizeLinkGroupKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLinkGroupExtensions(values, key, { required = false } = {}) {
  if (!Array.isArray(values)) {
    throw new LinkGroupValidationError("extensions-invalid", { key });
  }
  const extensions = [];
  const seen = new Set();
  for (const value of values) {
    const extension = String(value || "").trim().toLowerCase().replace(/^\.+/, "");
    if (!extension || !LINK_EXTENSION_PATTERN.test(extension)) {
      throw new LinkGroupValidationError("extension-invalid", {
        key,
        extension: String(value || ""),
      });
    }
    if (seen.has(extension)) {
      throw new LinkGroupValidationError("extension-duplicate", {
        extension,
        firstKey: key,
        secondKey: key,
      });
    }
    seen.add(extension);
    extensions.push(extension);
  }
  if (required && extensions.length === 0) {
    throw new LinkGroupValidationError("extensions-required", { key });
  }
  return extensions.sort();
}

export function validateLinkGroupSettings(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.groups)) {
    throw new LinkGroupValidationError("settings-invalid");
  }

  const builtIn = new Map();
  const custom = [];
  const keys = new Set();
  for (const entry of value.groups) {
    if (!entry || typeof entry !== "object") {
      throw new LinkGroupValidationError("group-invalid");
    }
    const key = normalizeLinkGroupKey(entry.key);
    if (!key) {
      throw new LinkGroupValidationError("key-required");
    }
    if (!LINK_GROUP_KEY_PATTERN.test(key) || key.length > 40) {
      throw new LinkGroupValidationError("key-invalid", { key });
    }
    if (keys.has(key)) {
      throw new LinkGroupValidationError("key-duplicate", { key });
    }
    keys.add(key);

    if (entry.builtIn === true) {
      if (!BUILT_IN_LINK_GROUP_EXTENSIONS.has(key) || builtIn.has(key)) {
        throw new LinkGroupValidationError("built-in-invalid", { key });
      }
      builtIn.set(key, {
        key,
        builtIn: true,
        enabled: entry.enabled !== false,
        extensions: normalizeLinkGroupExtensions(entry.extensions, key),
      });
      continue;
    }

    if (RESERVED_LINK_GROUP_KEYS.has(key)) {
      throw new LinkGroupValidationError("key-reserved", { key });
    }
    const name = String(entry.name || "").trim();
    if (!name) {
      throw new LinkGroupValidationError("name-required", { key });
    }
    if (name.length > 80) {
      throw new LinkGroupValidationError("name-too-long", { key });
    }
    custom.push({
      key,
      name,
      builtIn: false,
      enabled: entry.enabled !== false,
      extensions: normalizeLinkGroupExtensions(entry.extensions, key, {
        required: true,
      }),
    });
  }

  for (const key of BUILT_IN_LINK_GROUP_KEYS) {
    if (!builtIn.has(key)) {
      throw new LinkGroupValidationError("built-in-missing", { key });
    }
  }

  const extensionOwners = new Map();
  const groups = [
    ...BUILT_IN_LINK_GROUP_KEYS.map(key => builtIn.get(key)),
    ...custom,
  ];
  for (const group of groups) {
    for (const extension of group.extensions) {
      const firstKey = extensionOwners.get(extension);
      if (firstKey) {
        throw new LinkGroupValidationError("extension-duplicate", {
          extension,
          firstKey,
          secondKey: group.key,
        });
      }
      extensionOwners.set(extension, group.key);
    }
  }

  return { version: 1, groups };
}

function normalizedLinkGroupSettings(value) {
  return validateLinkGroupSettings(value || createDefaultLinkGroupSettings());
}

function createExtensionTypeMap(settings) {
  const types = new Map();
  for (const group of normalizedLinkGroupSettings(settings).groups) {
    if (!group.enabled) {
      continue;
    }
    for (const extension of group.extensions) {
      types.set(extension, group.key);
    }
  }
  return types;
}

export function openPageLinksDialog(window, context) {
  if (
    !context?.browser ||
    typeof window?.openDialog !== "function"
  ) {
    return null;
  }
  return window.openDialog(
    LINKS_DIALOG_URL,
    "downloadit-links",
    "chrome,titlebar,centerscreen,resizable,modal,width=980,height=680",
    { wrappedJSObject: { ...context } },
  );
}

function filenameFromURL(value) {
  try {
    const pathname = new URL(value).pathname;
    const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
    try {
      return decodeURIComponent(filename);
    } catch {
      return filename;
    }
  } catch {
    return "";
  }
}

export function getLinkExtension(link) {
  const filename = String(link?.filename || "").trim() ||
    filenameFromURL(link?.url || "");
  const separator = filename.lastIndexOf(".");
  if (separator <= 0 || separator === filename.length - 1) {
    return "";
  }
  const extension = filename.slice(separator + 1).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]*$/.test(extension) ? extension : "";
}

export function classifyLinkType(link, settings = null) {
  return createExtensionTypeMap(settings).get(getLinkExtension(link)) || "other";
}

export function isMagnetURL(value) {
  try {
    return new URL(String(value || "")).protocol === "magnet:";
  } catch {
    return false;
  }
}

export function isEd2kURL(value) {
  return /^ed2k:/i.test(String(value || ""));
}

function createLinkRecordWithTypes(link, index, extensionTypes) {
  const url = String(link?.url || "");
  const description = String(link?.description || "").trim() || url;
  const filename = String(link?.filename || "").trim();
  const extension = getLinkExtension({ url, filename });
  const record = {
    index,
    url,
    description,
    filename,
    extension,
    type: extensionTypes.get(extension) || "other",
    isMagnet: isMagnetURL(url),
    isEd2k: isEd2kURL(url),
    searchText: `${description}\n${filename}\n${url}`.toLowerCase(),
  };
  if (Number.isInteger(link?.browsingContextId) && link.browsingContextId > 0) {
    record.browsingContextId = link.browsingContextId;
  }
  return record;
}

export function createLinkRecord(link, index = 0, settings = null) {
  return createLinkRecordWithTypes(link, index, createExtensionTypeMap(settings));
}

function normalizeFilterValues(values, allowedValues = null) {
  if (values == null) {
    return new Set();
  }
  const entries = typeof values === "string" ? [values] : values;
  if (!entries?.[Symbol.iterator]) {
    return new Set();
  }
  const normalized = new Set();
  for (const value of entries) {
    const entry = String(value).toLowerCase();
    if (allowedValues && !allowedValues.has(entry)) {
      continue;
    }
    normalized.add(entry);
  }
  return normalized;
}

function normalizeProtocolFilter(value) {
  const protocol = String(value || "").trim().toLowerCase();
  return protocol === "magnet" || protocol === "ed2k" ? protocol : "";
}

export function filterLinkRecords(records, {
  types = [],
  extensions = [],
  protocol = "",
  search = "",
} = {}) {
  const normalizedTypes = normalizeFilterValues(types);
  const normalizedExtensions = normalizeFilterValues(extensions);
  const normalizedProtocol = normalizeProtocolFilter(protocol);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  return records.filter(record =>
    (normalizedTypes.size === 0 || normalizedTypes.has(record.type)) &&
    (normalizedExtensions.size === 0 || normalizedExtensions.has(record.extension)) &&
    (
      !normalizedProtocol ||
      (normalizedProtocol === "magnet" ? record.isMagnet : record.isEd2k)
    ) &&
    (!normalizedSearch || record.searchText.includes(normalizedSearch))
  );
}

function normalizeCopyTitle(value, fallback) {
  const title = String(value || "").replace(/[\t\r\n]+/g, " ").trim();
  return title || fallback;
}

function escapeMarkdownLabel(value) {
  return String(value || "").replace(/[\\\[\]]/g, "\\$&");
}

export function formatLinkCopyPayload(links, format = "url") {
  const entries = [];
  for (const link of Array.isArray(links) ? links : []) {
    const url = String(link?.url || "").trim();
    if (!url) {
      continue;
    }
    entries.push({
      url,
      title: normalizeCopyTitle(link?.description, url),
    });
  }

  if (format === "title-url") {
    return entries.map(({ title, url }) => `${title}\t${url}`).join("\n");
  }
  if (format === "markdown") {
    return entries.map(({ title, url }) =>
      `[${escapeMarkdownLabel(title)}](<${url}>)`
    ).join("\n");
  }
  return entries.map(({ url }) => url).join("\n");
}

export function getExtensionOptions(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.extension, (counts.get(record.extension) || 0) + 1);
  }
  return [...counts]
    .map(([extension, count]) => ({ extension, count }))
    .sort((left, right) => {
      if (!left.extension) {
        return 1;
      }
      if (!right.extension) {
        return -1;
      }
      return left.extension.localeCompare(right.extension);
    });
}

export class LinkSelectionModel {
  constructor(links = [], settings = null) {
    const extensionTypes = createExtensionTypeMap(settings);
    this.records = links.map(
      (link, index) => createLinkRecordWithTypes(link, index, extensionTypes),
    );
    this.selectedURLs = new Set();
  }

  visible(filters = {}) {
    return filterLinkRecords(this.records, filters);
  }

  setSelected(url, selected) {
    if (selected) {
      this.selectedURLs.add(url);
    } else {
      this.selectedURLs.delete(url);
    }
  }

  setVisibleSelected(filters, selected) {
    for (const record of this.visible(filters)) {
      this.setSelected(record.url, selected);
    }
  }

  clearSelection() {
    this.selectedURLs.clear();
  }

  selectionState(records = this.records) {
    const selectedCount = records.reduce(
      (count, record) => count + Number(this.selectedURLs.has(record.url)),
      0,
    );
    return {
      checked: records.length > 0 && selectedCount === records.length,
      indeterminate: selectedCount > 0 && selectedCount < records.length,
      disabled: records.length === 0,
      selectedCount,
    };
  }

  get selectedCount() {
    return this.selectedURLs.size;
  }

  selectedLinks() {
    return this.records
      .filter(record => this.selectedURLs.has(record.url))
      .map(record => {
        const link = {
          url: record.url,
          description: record.description,
          filename: record.filename,
        };
        if (Number.isInteger(record.browsingContextId) && record.browsingContextId > 0) {
          link.browsingContextId = record.browsingContextId;
        }
        return link;
      });
  }
}

function listBrowsingContexts(browser) {
  const contexts = [];
  const seen = new Set();
  const visit = browsingContext => {
    if (!browsingContext || seen.has(browsingContext)) {
      return;
    }
    seen.add(browsingContext);
    contexts.push(browsingContext);
    for (const child of browsingContext.children || []) {
      visit(child);
    }
  };
  visit(browser?.browsingContext);
  return contexts;
}

function meaningfulDescription(description, url) {
  const value = String(description || "").trim();
  return value && value !== url ? value : "";
}

export async function queryPageLinks(browser, {
  actorName = "DownloadItLinkCollector",
  query = PAGE_LINKS_QUERY,
} = {}) {
  const responses = await Promise.all(listBrowsingContexts(browser).map(
    async browsingContext => {
      try {
        const actor = browsingContext.currentWindowGlobal?.getActor?.(actorName);
        return {
          browsingContextId: browsingContext.id || 0,
          links: actor ? await actor.sendQuery(query) : [],
        };
      } catch {
        return { browsingContextId: browsingContext.id || 0, links: [] };
      }
    },
  ));

  const links = [];
  const byURL = new Map();
  for (const response of responses) {
    for (const value of Array.isArray(response.links) ? response.links : []) {
      const url = String(value?.url || "");
      if (
        classifyDownloadTarget({
          url,
          filename: value?.filename || "",
        }) !== DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED
      ) {
        continue;
      }
      const existing = byURL.get(url);
      if (existing) {
        if (!meaningfulDescription(existing.description, url)) {
          existing.description = meaningfulDescription(value.description, url) || url;
        }
        if (!existing.filename && value.filename) {
          existing.filename = String(value.filename);
        }
        continue;
      }
      const link = {
        url,
        description: meaningfulDescription(value.description, url) || url,
        filename: String(value?.filename || ""),
      };
      if (
        Number.isInteger(response.browsingContextId) &&
        response.browsingContextId > 0
      ) {
        link.browsingContextId = response.browsingContextId;
      }
      byURL.set(url, link);
      links.push(link);
    }
  }
  return links;
}
