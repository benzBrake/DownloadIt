export const MIRROR_SETTINGS_VERSION = 1;

const ADAPTER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class MirrorConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "MirrorConfigError";
    this.code = code;
    this.args = args;
  }
}

function isLoopbackHostname(hostname) {
  const value = String(hostname || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return value === "localhost" || value === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(value);
}

export function normalizeMirrorEndpoint(value, adapterId = "") {
  const endpoint = String(value || "").trim();
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new MirrorConfigError("mirror-endpoint-invalid", {
      adapter: adapterId,
    });
  }

  if (
    !url.hostname ||
    url.username ||
    url.password ||
    url.href.includes("?") ||
    url.href.includes("#") ||
    (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLoopbackHostname(url.hostname))
    )
  ) {
    throw new MirrorConfigError(
      url.protocol === "http:" && !isLoopbackHostname(url.hostname)
        ? "mirror-endpoint-insecure"
        : "mirror-endpoint-invalid",
      { adapter: adapterId },
    );
  }

  url.pathname = `${url.pathname.replace(/\/+$/g, "")}/`;
  return url.href;
}

function normalizeAdapter(adapter) {
  const id = String(adapter?.id || "").trim();
  if (
    !ADAPTER_ID_PATTERN.test(id) ||
    !adapter?.defaultSettings ||
    typeof adapter.normalizeSettings !== "function" ||
    typeof adapter.matches !== "function" ||
    typeof adapter.rewrite !== "function"
  ) {
    throw new TypeError("Invalid mirror adapter");
  }
  return Object.freeze({
    ...adapter,
    id,
  });
}

export class MirrorAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = [];
    this.adapterMap = new Map();
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(value) {
    const adapter = normalizeAdapter(value);
    if (this.adapterMap.has(adapter.id)) {
      throw new TypeError(`Duplicate mirror adapter: ${adapter.id}`);
    }
    this.adapters.push(adapter);
    this.adapterMap.set(adapter.id, adapter);
    return adapter;
  }

  createDefaultSettings() {
    return {
      version: MIRROR_SETTINGS_VERSION,
      adapters: Object.fromEntries(this.adapters.map(adapter => [
        adapter.id,
        adapter.normalizeSettings(adapter.defaultSettings),
      ])),
    };
  }

  validateSettings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new MirrorConfigError("mirror-settings-invalid");
    }
    if (value.version !== MIRROR_SETTINGS_VERSION) {
      throw new MirrorConfigError("mirror-settings-version", {
        version: value.version,
      });
    }
    if (
      !value.adapters ||
      typeof value.adapters !== "object" ||
      Array.isArray(value.adapters)
    ) {
      throw new MirrorConfigError("mirror-settings-invalid");
    }

    for (const id of Object.keys(value.adapters)) {
      if (!this.adapterMap.has(id)) {
        throw new MirrorConfigError("mirror-adapter-unknown", { adapter: id });
      }
    }

    const adapters = {};
    for (const adapter of this.adapters) {
      const settings = Object.hasOwn(value.adapters, adapter.id)
        ? value.adapters[adapter.id]
        : adapter.defaultSettings;
      adapters[adapter.id] = adapter.normalizeSettings(settings);
    }
    return {
      version: MIRROR_SETTINGS_VERSION,
      adapters,
    };
  }

  resolve(value, settings, { postData = "" } = {}) {
    if (String(postData || "")) {
      return null;
    }

    let url;
    const originalURL = String(value || "");
    try {
      url = new URL(originalURL);
    } catch {
      return null;
    }

    const normalizedSettings = this.validateSettings(settings);
    for (const adapter of this.adapters) {
      const adapterSettings = normalizedSettings.adapters[adapter.id];
      if (
        !adapterSettings.enabled ||
        !adapter.matches(url, originalURL, adapterSettings)
      ) {
        continue;
      }
      const rewrittenURL = adapter.rewrite(
        originalURL,
        url,
        adapterSettings,
      );
      if (!rewrittenURL || rewrittenURL === originalURL) {
        return null;
      }
      return {
        adapterId: adapter.id,
        originalURL,
        url: rewrittenURL,
      };
    }
    return null;
  }

  rewriteJob(job, settings) {
    if (!job || !Array.isArray(job.links)) {
      throw new TypeError("A download job with links is required");
    }

    let mirroredCount = 0;
    const adapterIds = new Set();
    const links = job.links.map(link => {
      const nextLink = { ...link };
      const match = this.resolve(link?.url, settings, {
        postData: link?.postdata ?? link?.postData ?? "",
      });
      if (!match) {
        return nextLink;
      }
      mirroredCount++;
      adapterIds.add(match.adapterId);
      nextLink.url = match.url;
      nextLink.cookies = "";
      nextLink.cookieRecords = [];
      return nextLink;
    });

    return {
      job: {
        ...job,
        links,
        dlpageCookies: mirroredCount ? "" : job.dlpageCookies,
      },
      mirroredCount,
      adapterIds: [...adapterIds],
    };
  }
}

export function createDefaultMirrorSettings(registry) {
  if (!(registry instanceof MirrorAdapterRegistry)) {
    throw new TypeError("A mirror adapter registry is required");
  }
  return registry.createDefaultSettings();
}

export function validateMirrorSettings(value, registry) {
  if (!(registry instanceof MirrorAdapterRegistry)) {
    throw new TypeError("A mirror adapter registry is required");
  }
  return registry.validateSettings(value);
}
