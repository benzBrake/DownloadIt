import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(
  projectRoot,
  "addon/chrome/content/DownloadItAriaNgActor.sys.mjs",
);

let importCounter = 0;

async function loadActorModule() {
  delete globalThis.JSWindowActorParent;
  delete globalThis.JSWindowActorChild;
  importCounter += 1;
  return import(`${pathToFileURL(modulePath).href}?test=${importCounter}`);
}

function createWindow(initialOptions = null) {
  let storedValue = initialOptions === null
    ? null
    : JSON.stringify(initialOptions);
  let writes = 0;
  let reloads = 0;
  const window = {
    localStorage: {
      getItem(key) {
        assert.equal(key, "AriaNg.Options");
        return storedValue;
      },
      setItem(key, value) {
        assert.equal(key, "AriaNg.Options");
        storedValue = value;
        writes += 1;
      },
    },
    location: {
      reload() {
        reloads += 1;
      },
    },
    get storedOptions() {
      return storedValue === null ? null : JSON.parse(storedValue);
    },
    get writes() {
      return writes;
    },
    get reloads() {
      return reloads;
    },
  };
  return window;
}

test("AriaNg Actor Parent returns only enabled normalized Aria2Next RPC data", async () => {
  let service = {
    getAria2NextSettings() {
      return { enabled: true, rpcPort: 6801, secret: "秘密" };
    },
    normalizeAria2NextSettings(settings) {
      assert.deepEqual(settings, {
        enabled: true,
        rpcPort: 6801,
        secret: "秘密",
      });
      return {
        rpcPort: 6801,
        secret: "秘密",
        rpcUrl: "http://127.0.0.1:6801/jsonrpc",
      };
    },
  };
  globalThis.ChromeUtils = {
    importESModule(spec) {
      assert.equal(
        spec,
        "chrome://downloadit/content/DownloadItService.sys.mjs",
      );
      return {
        getActiveService: () => service,
      };
    },
  };

  const actorModule = await loadActorModule();
  const actor = new actorModule.DownloadItAriaNgParent();
  assert.deepEqual(
    actor.receiveMessage({
      name: "DownloadItAriaNg:GetAria2NextRpcConfiguration",
    }),
    { rpcPort: 6801, secret: "秘密" },
  );

  service = {
    getAria2NextSettings: () => ({ enabled: false, rpcPort: 6801, secret: "秘密" }),
    normalizeAria2NextSettings: () => ({ rpcPort: 6801, secret: "秘密" }),
  };
  assert.equal(
    actor.receiveMessage({
      name: "DownloadItAriaNg:GetAria2NextRpcConfiguration",
    }),
    null,
  );
  assert.equal(actor.receiveMessage({ name: "unknown" }), null);
  assert.deepEqual(
    actor.receiveQuery({
      name: "DownloadItAriaNg:GetAria2NextRpcConfiguration",
    }),
    null,
  );
});

test("AriaNg Actor synchronizes the default RPC profile once and preserves other options", async () => {
  const actorModule = await loadActorModule();
  const window = createWindow({
    language: "zh_CN",
    rpcAlias: "Local Aria2",
    rpcHost: "moz-extension-host",
    rpcPort: "6800",
    rpcInterface: "old",
    protocol: "https",
    httpMethod: "GET",
    rpcRequestHeaders: "X-Test: keep?",
    secret: "b2xk",
    extendRpcServers: [{ rpcHost: "remote.example", rpcPort: "443" }],
  });
  const actor = new actorModule.DownloadItAriaNgChild();
  actor.contentWindow = window;
  actor.sendQuery = async name => {
    assert.equal(name, "DownloadItAriaNg:GetAria2NextRpcConfiguration");
    return { rpcPort: 6801, secret: "秘密" };
  };

  assert.equal(await actor.handleEvent({ type: "DOMContentLoaded" }), true);
  assert.equal(window.writes, 1);
  assert.equal(window.reloads, 1);
  assert.deepEqual(window.storedOptions, {
    language: "zh_CN",
    rpcAlias: "Local Aria2",
    rpcHost: "127.0.0.1",
    rpcPort: "6801",
    rpcInterface: "jsonrpc",
    protocol: "http",
    httpMethod: "POST",
    rpcRequestHeaders: "",
    secret: Buffer.from("秘密", "utf8").toString("base64"),
    extendRpcServers: [{ rpcHost: "remote.example", rpcPort: "443" }],
  });

  assert.equal(await actor.handleEvent({ type: "DOMContentLoaded" }), false);
  assert.equal(window.writes, 1);
  assert.equal(window.reloads, 1);
});

test("AriaNg Actor leaves disabled, invalid, and unavailable configurations unchanged", async () => {
  const actorModule = await loadActorModule();
  const cases = [
    {
      options: { rpcHost: "manual", rpcPort: "9000" },
      query: null,
    },
    {
      options: { rpcHost: "manual", rpcPort: "9000" },
      query: { rpcPort: 70000, secret: "invalid" },
    },
  ];

  for (const { options, query } of cases) {
    const window = createWindow(options);
    const actor = new actorModule.DownloadItAriaNgChild();
    actor.contentWindow = window;
    actor.sendQuery = async () => query;
    assert.equal(await actor.handleEvent({ type: "DOMContentLoaded" }), false);
    assert.equal(window.writes, 0);
    assert.equal(window.reloads, 0);
    assert.deepEqual(window.storedOptions, options);
  }

  const invalidStorageWindow = createWindow({ rpcHost: "manual" });
  invalidStorageWindow.localStorage.getItem = () => "{invalid";
  const invalidStorageActor = new actorModule.DownloadItAriaNgChild();
  invalidStorageActor.contentWindow = invalidStorageWindow;
  invalidStorageActor.sendQuery = async () => ({ rpcPort: 6800, secret: "secret" });
  assert.equal(
    await invalidStorageActor.handleEvent({ type: "DOMContentLoaded" }),
    false,
  );
  assert.equal(invalidStorageWindow.writes, 0);
  assert.equal(invalidStorageWindow.reloads, 0);

  const unavailableStorageWindow = createWindow({ rpcHost: "manual" });
  unavailableStorageWindow.localStorage.getItem = () => {
    throw new Error("storage unavailable");
  };
  const unavailableStorageActor = new actorModule.DownloadItAriaNgChild();
  unavailableStorageActor.contentWindow = unavailableStorageWindow;
  unavailableStorageActor.sendQuery = async () => ({
    rpcPort: 6800,
    secret: "secret",
  });
  assert.equal(
    await unavailableStorageActor.handleEvent({ type: "DOMContentLoaded" }),
    false,
  );
  assert.equal(unavailableStorageWindow.writes, 0);
  assert.equal(unavailableStorageWindow.reloads, 0);
});

test("AriaNg Actor retries configuration when the service becomes available at load", async () => {
  const actorModule = await loadActorModule();
  const window = createWindow({
    rpcHost: "9a0e38cc-39bb-40c7-896a-6f8128e23d5d",
    rpcPort: "6800",
  });
  const actor = new actorModule.DownloadItAriaNgChild();
  actor.contentWindow = window;
  let queryCount = 0;
  actor.sendQuery = async () => {
    queryCount += 1;
    return queryCount === 1 ? null : { rpcPort: 6800, secret: "secret" };
  };

  assert.equal(await actor.handleEvent({ type: "DOMContentLoaded" }), false);
  assert.equal(await actor.handleEvent({ type: "load" }), true);
  assert.equal(window.storedOptions.rpcHost, "127.0.0.1");
  assert.equal(window.storedOptions.rpcPort, "6800");
  assert.equal(window.writes, 1);
  assert.equal(window.reloads, 1);
});

test("AriaNg Actor module remains included by both packaging scripts", () => {
  for (const relativePath of ["pack.ps1", "pack.sh"]) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
    assert.match(source, /chrome\/content\/DownloadItAriaNgActor\.sys\.mjs/);
  }
});
