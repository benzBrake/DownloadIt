import { isSupportedURL } from "./DownloadItProtocol.sys.mjs";

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

const EXTENSION_TYPES = new Map();

function registerExtensions(type, values) {
  for (const value of values) {
    EXTENSION_TYPES.set(value, type);
  }
}

registerExtensions("image", [
  "avif", "bmp", "gif", "heic", "heif", "ico", "jfif", "jpeg", "jpg",
  "png", "svg", "tif", "tiff", "webp",
]);
registerExtensions("video", [
  "3gp", "avi", "flv", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg",
  "mpg", "ogv", "ts", "webm", "wmv",
]);
registerExtensions("audio", [
  "aac", "flac", "m4a", "mid", "midi", "mp3", "oga", "ogg", "opus",
  "wav", "wma",
]);
registerExtensions("document", [
  "csv", "doc", "docx", "epub", "md", "odp", "ods", "odt", "pdf",
  "ppt", "pptx", "rtf", "txt", "xls", "xlsx",
]);
registerExtensions("archive", [
  "7z", "bz2", "gz", "iso", "rar", "tar", "tgz", "xz", "zip", "zst",
]);
registerExtensions("program", [
  "apk", "appx", "deb", "dmg", "exe", "msi", "msix", "pkg", "rpm", "xpi",
]);

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

export function classifyLinkType(link) {
  return EXTENSION_TYPES.get(getLinkExtension(link)) || "other";
}

export function createLinkRecord(link, index = 0) {
  const url = String(link?.url || "");
  const description = String(link?.description || "").trim() || url;
  const filename = String(link?.filename || "").trim();
  const extension = getLinkExtension({ url, filename });
  return {
    index,
    url,
    description,
    filename,
    extension,
    type: EXTENSION_TYPES.get(extension) || "other",
    searchText: `${description}\n${filename}\n${url}`.toLowerCase(),
  };
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

export function filterLinkRecords(records, {
  types = [],
  extensions = [],
  search = "",
} = {}) {
  const allowedTypes = new Set(LINK_TYPE_VALUES);
  const normalizedTypes = normalizeFilterValues(types, allowedTypes);
  const normalizedExtensions = normalizeFilterValues(extensions);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  return records.filter(record =>
    (normalizedTypes.size === 0 || normalizedTypes.has(record.type)) &&
    (normalizedExtensions.size === 0 || normalizedExtensions.has(record.extension)) &&
    (!normalizedSearch || record.searchText.includes(normalizedSearch))
  );
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
  constructor(links = []) {
    this.records = links.map((link, index) => createLinkRecord(link, index));
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
      .map(record => ({
        url: record.url,
        description: record.description,
        filename: record.filename,
      }));
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
  actorName = "DownloadItSelection",
  query = PAGE_LINKS_QUERY,
} = {}) {
  const responses = await Promise.all(listBrowsingContexts(browser).map(
    async browsingContext => {
      try {
        const actor = browsingContext.currentWindowGlobal?.getActor?.(actorName);
        return actor ? await actor.sendQuery(query) : [];
      } catch {
        return [];
      }
    },
  ));

  const links = [];
  const byURL = new Map();
  for (const response of responses) {
    for (const value of Array.isArray(response) ? response : []) {
      const url = String(value?.url || "");
      if (!isSupportedURL(url)) {
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
      byURL.set(url, link);
      links.push(link);
    }
  }
  return links;
}
