export const OP_ONE = 0;
export const OP_SEL = 1;

const SUPPORTED_PROTOCOLS = new Set([
  "http:",
  "https:",
  "ftp:",
  "magnet:",
]);

const BROWSER_NATIVE_ONLY_PROTOCOLS = new Set([
  "blob:",
  "data:",
]);
const FIREFOX_INSTALL_PROTOCOLS = new Set([
  "http:",
  "https:",
]);
const XPINSTALL_PATH_PATTERN = /(?:^|[/._-])xpinstall(?:$|[/._-])/i;

export const DOWNLOAD_TARGET_CLASSIFICATION = Object.freeze({
  SUPPORTED: "supported",
  BROWSER_NATIVE_ONLY: "browser-native-only",
  FIREFOX_INSTALL: "firefox-install",
  UNSUPPORTED: "unsupported",
});

function parseURL(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname.replace(/(?:%[0-9a-f]{2})+/gi, value => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    });
  }
}

function isFirefoxInstallPath(url) {
  if (!FIREFOX_INSTALL_PROTOCOLS.has(url.protocol)) {
    return false;
  }
  const pathname = decodePathname(url.pathname).toLowerCase();
  const leafName = pathname.slice(pathname.lastIndexOf("/") + 1);
  return leafName.endsWith(".xpi") || XPINSTALL_PATH_PATTERN.test(pathname);
}

function isFirefoxInstallMetadata({
  filename = "",
  mimeType = "",
  primaryExtension = "",
} = {}) {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  const normalizedExtension = String(primaryExtension || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");
  return (
    normalizedFilename.endsWith(".xpi") ||
    normalizedExtension === "xpi" ||
    String(mimeType || "").toLowerCase().includes("xpinstall")
  );
}

export function classifyDownloadTargetURL(value) {
  const url = parseURL(value);
  if (!url) {
    return DOWNLOAD_TARGET_CLASSIFICATION.UNSUPPORTED;
  }
  if (BROWSER_NATIVE_ONLY_PROTOCOLS.has(url.protocol)) {
    return DOWNLOAD_TARGET_CLASSIFICATION.BROWSER_NATIVE_ONLY;
  }
  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    return DOWNLOAD_TARGET_CLASSIFICATION.UNSUPPORTED;
  }
  if (isFirefoxInstallPath(url)) {
    return DOWNLOAD_TARGET_CLASSIFICATION.FIREFOX_INSTALL;
  }
  return DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED;
}

export function classifyDownloadTarget({
  url = "",
  filename = "",
  mimeType = "",
  primaryExtension = "",
} = {}) {
  const classification = classifyDownloadTargetURL(url);
  if (classification !== DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED) {
    return classification;
  }
  return isFirefoxInstallMetadata({ filename, mimeType, primaryExtension })
    ? DOWNLOAD_TARGET_CLASSIFICATION.FIREFOX_INSTALL
    : DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED;
}

export function isSupportedContextURL(value) {
  const url = parseURL(value);
  return Boolean(url && SUPPORTED_PROTOCOLS.has(url.protocol));
}

export function isSupportedURL(value) {
  return classifyDownloadTargetURL(value) ===
    DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED;
}

export function parseAvailableManagers(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Downloader list must be an array");
  }

  const managers = [];
  const seen = new Set();
  for (const entry of value) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (entry?.available !== true || !name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    managers.push(name);
  }
  return managers;
}

export function sanitizeFilename(value) {
  return String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

function buildDownloadLink({
  url,
  description = "",
  cookies = "",
  postData = "",
  filename = "",
  extension = "",
}) {
  if (
    classifyDownloadTarget({
      url,
      filename,
      primaryExtension: extension,
    }) !== DOWNLOAD_TARGET_CLASSIFICATION.SUPPORTED
  ) {
    throw new TypeError("Unsupported download URL");
  }

  const normalizedFilename = sanitizeFilename(filename);
  const inferredExtension = normalizedFilename.includes(".")
    ? normalizedFilename.slice(normalizedFilename.lastIndexOf(".") + 1)
    : "";

  return {
    url: String(url),
    desc: String(description || ""),
    cookies: String(cookies || ""),
    postdata: String(postData || ""),
    filename: normalizedFilename,
    extension: String(extension || inferredExtension),
  };
}

export function buildDownloadBatchJob({
  manager,
  links,
  referer = "",
  downloadPageReferer = "",
  downloadPageCookies = "",
  userAgent = "",
}) {
  const normalizedManager = String(manager || "").trim();
  if (!normalizedManager) {
    throw new TypeError("A download manager is required");
  }
  if (!Array.isArray(links) || links.length === 0) {
    throw new TypeError("At least one download URL is required");
  }

  const normalizedLinks = links.map(link => buildDownloadLink(link || {}));

  return {
    dlcount: normalizedLinks.length,
    dmName: normalizedManager,
    optype: normalizedLinks.length > 1 ? OP_SEL : OP_ONE,
    referer: String(referer || ""),
    dlpageReferer: String(downloadPageReferer || ""),
    dlpageCookies: String(downloadPageCookies || ""),
    useragent: String(userAgent || ""),
    links: normalizedLinks,
  };
}

export function buildDownloadJob({
  manager,
  url,
  description = "",
  cookies = "",
  postData = "",
  filename = "",
  extension = "",
  referer = "",
  downloadPageReferer = "",
  downloadPageCookies = "",
  userAgent = "",
}) {
  return buildDownloadBatchJob({
    manager,
    links: [{
      url,
      description,
      cookies,
      postData,
      filename,
      extension,
    }],
    referer,
    downloadPageReferer,
    downloadPageCookies,
    userAgent,
  });
}
