const ARIANG_RPC_QUERY = "DownloadItAriaNg:GetAria2NextRpcConfiguration";
const ARIANG_OPTIONS_STORAGE_KEY = "AriaNg.Options";
const ARIA2NEXT_RPC_HOST = "127.0.0.1";

const ParentActor = typeof JSWindowActorParent === "function"
  ? JSWindowActorParent
  : class {};
const ChildActor = typeof JSWindowActorChild === "function"
  ? JSWindowActorChild
  : class {};

function readAria2NextRpcConfiguration() {
  try {
    const { getActiveService } = ChromeUtils.importESModule(
      "chrome://downloadit/content/DownloadItService.sys.mjs",
    );
    const service = getActiveService?.();
    if (
      !service?.getAria2NextSettings ||
      !service?.normalizeAria2NextSettings
    ) {
      return null;
    }

    const settings = service.getAria2NextSettings();
    if (!settings?.enabled) {
      return null;
    }
    const normalized = service.normalizeAria2NextSettings(settings);
    return {
      rpcPort: normalized.rpcPort,
      secret: normalized.secret,
    };
  } catch {
    return null;
  }
}

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function isValidRpcConfiguration(configuration) {
  const port = Number(configuration?.rpcPort);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 &&
    typeof configuration?.secret === "string";
}

function readStoredOptions(storage) {
  const raw = storage.getItem(ARIANG_OPTIONS_STORAGE_KEY);
  if (raw === null) {
    return {};
  }

  let options;
  try {
    options = JSON.parse(raw);
  } catch {
    return null;
  }
  return options && typeof options === "object" && !Array.isArray(options)
    ? options
    : null;
}

export function syncAriaNgRpcOptions(window, configuration) {
  if (!window?.localStorage || !isValidRpcConfiguration(configuration)) {
    return false;
  }

  let options;
  try {
    options = readStoredOptions(window.localStorage);
  } catch {
    return false;
  }
  if (options === null) {
    return false;
  }

  const nextValues = {
    rpcHost: ARIA2NEXT_RPC_HOST,
    rpcPort: String(configuration.rpcPort),
    rpcInterface: "jsonrpc",
    protocol: "http",
    httpMethod: "POST",
    rpcRequestHeaders: "",
    secret: encodeUtf8Base64(configuration.secret),
  };
  const changed = Object.entries(nextValues).some(
    ([key, value]) => options[key] !== value,
  );
  if (!changed) {
    return false;
  }

  try {
    window.localStorage.setItem(
      ARIANG_OPTIONS_STORAGE_KEY,
      JSON.stringify({ ...options, ...nextValues }),
    );
    window.location?.reload?.();
    return true;
  } catch {
    return false;
  }
}

export class DownloadItAriaNgParent extends ParentActor {
  receiveMessage({ name }) {
    if (name !== ARIANG_RPC_QUERY) {
      return null;
    }
    return readAria2NextRpcConfiguration();
  }

  receiveQuery(message) {
    return this.receiveMessage(message);
  }
}

export class DownloadItAriaNgChild extends ChildActor {
  constructor() {
    super();
    this.rpcSyncPromise = null;
  }

  async handleEvent(event) {
    if (event?.type !== "DOMContentLoaded" && event?.type !== "load") {
      return false;
    }

    if (this.rpcSyncPromise) {
      return this.rpcSyncPromise;
    }

    this.rpcSyncPromise = this.syncRpcOptions();
    try {
      return await this.rpcSyncPromise;
    } finally {
      this.rpcSyncPromise = null;
    }
  }

  async syncRpcOptions() {
    try {
      const configuration = await this.sendQuery?.(ARIANG_RPC_QUERY);
      return syncAriaNgRpcOptions(this.contentWindow, configuration);
    } catch {
      return false;
    }
  }
}
