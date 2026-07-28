import test from "node:test";
import assert from "node:assert/strict";

import { githubMirrorAdapter } from
  "../addon/chrome/content/DownloadItGitHubMirror.sys.mjs";
import {
  MIRROR_SETTINGS_VERSION,
  MirrorAdapterRegistry,
  normalizeMirrorEndpoint,
} from "../addon/chrome/content/DownloadItMirrors.sys.mjs";

function createRegistry() {
  return new MirrorAdapterRegistry([githubMirrorAdapter]);
}

function enabledSettings(endpoint = "https://gh-proxy.com/") {
  return {
    version: MIRROR_SETTINGS_VERSION,
    adapters: {
      github: { enabled: true, endpoint },
    },
  };
}

function isGitHubMirrorDownloadURL(value) {
  const settings = enabledSettings().adapters.github;
  return githubMirrorAdapter.matches(new URL(value), value, settings);
}

test("GitHub mirror matching accepts supported file routes", () => {
  for (const url of [
    "https://github.com/owner/repo/releases/download/v1.0/app.zip",
    "https://github.com/owner/repo/releases/latest/download/app.zip",
    "https://github.com/owner/repo/archive/refs/heads/main.zip",
    "https://github.com/owner/repo/archive/main.zip",
    "https://github.com/owner/repo/raw/main/path/file.txt?download=1",
    "https://github.com/owner/repo/zipball/main",
    "https://github.com/owner/repo/tarball/main",
    "https://codeload.github.com/owner/repo/zip/refs/heads/main",
    "https://codeload.github.com/owner/repo/tar.gz/refs/tags/v1.0",
    "https://codeload.github.com/owner/repo/legacy.zip/main",
    "https://codeload.github.com/owner/repo/legacy.tar.gz/v1.0",
    "https://raw.githubusercontent.com/owner/repo/main/path/file.txt",
  ]) {
    assert.equal(isGitHubMirrorDownloadURL(url), true, url);
  }
});

test("GitHub mirror matching rejects pages and transient object URLs", () => {
  for (const url of [
    "http://github.com/owner/repo/releases/download/v1.0/app.zip",
    "https://github.com/owner/repo",
    "https://github.com/owner/repo/releases/tag/v1.0",
    "https://github.com/owner/repo/blob/main/file.txt",
    "https://codeload.github.com/owner/repo/blob/main",
    "https://api.github.com/repos/owner/repo/releases",
    "https://objects.githubusercontent.com/github-production-release-asset/file",
    "https://gh-proxy.com/https://github.com/owner/repo/archive/main.zip",
  ]) {
    assert.equal(isGitHubMirrorDownloadURL(url), false, url);
  }
});

test("mirror endpoints require HTTPS except for loopback HTTP", () => {
  assert.equal(
    normalizeMirrorEndpoint("https://mirror.example/base"),
    "https://mirror.example/base/",
  );
  assert.equal(
    normalizeMirrorEndpoint("http://127.0.0.1:8080/proxy/"),
    "http://127.0.0.1:8080/proxy/",
  );
  assert.throws(
    () => normalizeMirrorEndpoint("http://mirror.example/"),
    error => error.code === "mirror-endpoint-insecure",
  );
  assert.throws(
    () => normalizeMirrorEndpoint("http://127.example.com/"),
    error => error.code === "mirror-endpoint-insecure",
  );
  for (const endpoint of [
    "ftp://mirror.example/",
    "https://user:pass@mirror.example/",
    "https://mirror.example/?",
    "https://mirror.example/?token=secret",
    "https://mirror.example/#",
    "https://mirror.example/#fragment",
  ]) {
    assert.throws(() => normalizeMirrorEndpoint(endpoint), { name: "MirrorConfigError" });
  }
});

test("mirror settings add defaults and reject unknown adapters", () => {
  const registry = createRegistry();
  assert.deepEqual(registry.createDefaultSettings(), {
    version: MIRROR_SETTINGS_VERSION,
    adapters: {
      github: {
        enabled: false,
        endpoint: "https://gh-proxy.com/",
      },
    },
  });
  assert.deepEqual(registry.validateSettings({
    version: MIRROR_SETTINGS_VERSION,
    adapters: {},
  }), registry.createDefaultSettings());
  assert.throws(() => registry.validateSettings({
    version: MIRROR_SETTINGS_VERSION,
    adapters: { custom: { enabled: true, endpoint: "https://example.com/" } },
  }), error => error.code === "mirror-adapter-unknown");
  assert.throws(() => registry.validateSettings({
    version: 2,
    adapters: {},
  }), error => error.code === "mirror-settings-version");
});

test("registry order selects only the first matching adapter", () => {
  const second = {
    ...githubMirrorAdapter,
    id: "second",
    defaultSettings: { enabled: true, endpoint: "https://second.example/" },
  };
  const registry = new MirrorAdapterRegistry([githubMirrorAdapter, second]);
  const settings = {
    version: MIRROR_SETTINGS_VERSION,
    adapters: {
      github: { enabled: true, endpoint: "https://first.example/" },
      second: { enabled: true, endpoint: "https://second.example/" },
    },
  };
  assert.equal(
    registry.resolve(
      "https://github.com/owner/repo/releases/download/v1/app.zip",
      settings,
    ).url,
    "https://first.example/https://github.com/owner/repo/releases/download/v1/app.zip",
  );
});

test("custom endpoints do not rewrite their own mirrored URLs again", () => {
  const registry = createRegistry();
  const settings = enabledSettings(
    "https://raw.githubusercontent.com/mirror/proxy/",
  );
  const originalURL =
    "https://github.com/owner/repo/releases/download/v1/app.zip";
  const rewrittenURL = registry.resolve(originalURL, settings).url;

  assert.equal(
    rewrittenURL,
    `https://raw.githubusercontent.com/mirror/proxy/${originalURL}`,
  );
  assert.equal(registry.resolve(rewrittenURL, settings), null);
});

test("job rewriting preserves metadata and removes mirrored cookies", () => {
  const registry = createRegistry();
  const source = {
    dmName: "Firefox",
    referer: "https://github.com/owner/repo/releases/tag/v1",
    dlpageCookies: "github_session=page",
    links: [
      {
        url: "https://github.com/owner/repo/releases/download/v1/app.zip?x=1",
        desc: "App",
        filename: "app.zip",
        postdata: "",
        cookies: "github_session=link",
        cookieRecords: [{ name: "github_session", value: "link" }],
      },
      {
        url: "https://example.com/other.zip",
        desc: "Other",
        filename: "other.zip",
        postdata: "",
        cookies: "site=other",
        cookieRecords: [{ name: "site", value: "other" }],
      },
    ],
  };
  const result = registry.rewriteJob(source, enabledSettings());

  assert.equal(result.mirroredCount, 1);
  assert.deepEqual(result.adapterIds, ["github"]);
  assert.equal(
    result.job.links[0].url,
    "https://gh-proxy.com/https://github.com/owner/repo/releases/download/v1/app.zip?x=1",
  );
  assert.equal(result.job.links[0].cookies, "");
  assert.deepEqual(result.job.links[0].cookieRecords, []);
  assert.equal(result.job.links[0].filename, "app.zip");
  assert.equal(result.job.links[1].url, source.links[1].url);
  assert.equal(result.job.links[1].cookies, "site=other");
  assert.equal(result.job.dlpageCookies, "");
  assert.equal(source.links[0].url.startsWith("https://github.com/"), true);
});

test("disabled adapters and POST links remain unchanged", () => {
  const registry = createRegistry();
  const url = "https://github.com/owner/repo/releases/download/v1/app.zip";
  assert.equal(registry.resolve(url, registry.createDefaultSettings()), null);
  assert.equal(registry.resolve(url, enabledSettings(), { postData: "a=1" }), null);

  const result = registry.rewriteJob({
    dlpageCookies: "page=1",
    links: [{ url, postdata: "a=1", cookies: "link=1" }],
  }, enabledSettings());
  assert.equal(result.mirroredCount, 0);
  assert.equal(result.job.links[0].url, url);
  assert.equal(result.job.links[0].cookies, "link=1");
  assert.equal(result.job.dlpageCookies, "page=1");
});
