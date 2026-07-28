import {
  MirrorConfigError,
  normalizeMirrorEndpoint,
} from "./DownloadItMirrors.sys.mjs";

const GITHUB_MIRROR_ADAPTER_ID = "github";
const GITHUB_MIRROR_DEFAULT_ENDPOINT = "https://gh-proxy.com/";

const GITHUB_HOST = "github.com";
const GITHUB_RAW_HOST = "raw.githubusercontent.com";
const GITHUB_CODELOAD_HOST = "codeload.github.com";
const CODELOAD_ARCHIVE_ROUTES = new Set([
  "zip",
  "tar.gz",
  "legacy.zip",
  "legacy.tar.gz",
]);

function hasPathSegments(pathname, count) {
  return pathname.split("/").filter(Boolean).length >= count;
}

function isGitHubCodeloadDownload(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length >= 4 &&
    CODELOAD_ARCHIVE_ROUTES.has(segments[2])
  );
}

function isGitHubRepositoryDownload(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 4) {
    return false;
  }

  const route = segments[2];
  if (route === "archive") {
    return segments.length >= 4;
  }
  if (route === "raw") {
    return segments.length >= 5;
  }
  if (route === "zipball" || route === "tarball") {
    return segments.length >= 4;
  }
  if (route !== "releases") {
    return false;
  }
  return (
    segments[3] === "download" && segments.length >= 6
  ) || (
    segments[3] === "latest" &&
    segments[4] === "download" &&
    segments.length >= 6
  );
}

function isGitHubMirrorDownloadURL(value) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(String(value || ""));
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === GITHUB_HOST) {
    return isGitHubRepositoryDownload(url.pathname);
  }
  if (hostname === GITHUB_RAW_HOST) {
    return hasPathSegments(url.pathname, 4);
  }
  if (hostname === GITHUB_CODELOAD_HOST) {
    return isGitHubCodeloadDownload(url.pathname);
  }
  return false;
}

function normalizeGitHubMirrorSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MirrorConfigError("mirror-adapter-invalid", {
      adapter: GITHUB_MIRROR_ADAPTER_ID,
    });
  }
  const enabled = value.enabled ?? false;
  if (typeof enabled !== "boolean") {
    throw new MirrorConfigError("mirror-adapter-invalid", {
      adapter: GITHUB_MIRROR_ADAPTER_ID,
    });
  }
  return {
    enabled,
    endpoint: normalizeMirrorEndpoint(
      value.endpoint ?? GITHUB_MIRROR_DEFAULT_ENDPOINT,
      GITHUB_MIRROR_ADAPTER_ID,
    ),
  };
}

export const githubMirrorAdapter = Object.freeze({
  id: GITHUB_MIRROR_ADAPTER_ID,
  nameL10nId: "downloadit-mirror-github-name",
  descriptionL10nId: "downloadit-mirror-github-description",
  defaultSettings: Object.freeze({
    enabled: false,
    endpoint: GITHUB_MIRROR_DEFAULT_ENDPOINT,
  }),
  normalizeSettings: normalizeGitHubMirrorSettings,
  matches: (url, originalURL, settings) =>
    !originalURL.startsWith(settings.endpoint) &&
    isGitHubMirrorDownloadURL(url),
  rewrite: (originalURL, _url, settings) =>
    `${settings.endpoint}${originalURL}`,
});
