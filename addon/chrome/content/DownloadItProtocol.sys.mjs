export const OP_ONE = 0;

const SUPPORTED_PROTOCOLS = new Set([
  "http:",
  "https:",
  "ftp:",
  "magnet:",
]);

export function isSupportedURL(value) {
  try {
    return SUPPORTED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
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
  const normalizedManager = String(manager || "").trim();
  if (!normalizedManager) {
    throw new TypeError("A download manager is required");
  }
  if (!isSupportedURL(url)) {
    throw new TypeError("Unsupported download URL");
  }

  const normalizedFilename = sanitizeFilename(filename);
  const inferredExtension = normalizedFilename.includes(".")
    ? normalizedFilename.slice(normalizedFilename.lastIndexOf(".") + 1)
    : "";

  return {
    dlcount: 1,
    dmName: normalizedManager,
    optype: OP_ONE,
    referer: String(referer || ""),
    dlpageReferer: String(downloadPageReferer || ""),
    dlpageCookies: String(downloadPageCookies || ""),
    useragent: String(userAgent || ""),
    links: [
      {
        url: String(url),
        desc: String(description || ""),
        cookies: String(cookies || ""),
        postdata: String(postData || ""),
        filename: normalizedFilename,
        extension: String(extension || inferredExtension),
      },
    ],
  };
}
