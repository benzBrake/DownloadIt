import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapSource = fs.readFileSync(
  path.join(projectRoot, "addon/bootstrap.js"),
  "utf8",
);

function createBootstrapContext({
  serviceStartup = async () => {},
  serviceShutdown = async () => {},
  serviceUnregister = () => {},
  ariaNgStartup = async () => {},
  ariaNgShutdown = async () => {},
  keepProfileData = true,
} = {}) {
  const events = [];
  const reportedErrors = [];
  const unloadedModules = [];
  let unregisteredService = null;
  const asyncShutdownBlockers = [];
  const removedPaths = [];

  function createProfileFile(path) {
    return {
      path,
      exists() {
        return true;
      },
      append(name) {
        this.path += `\\${name}`;
      },
      clone() {
        return createProfileFile(this.path);
      },
      remove(recursive) {
        removedPaths.push({ path: this.path, recursive });
      },
    };
  }

  const serviceInstance = {
    async startup() {
      events.push("service-startup");
      return serviceStartup();
    },
    async shutdown() {
      events.push("service-shutdown");
      return serviceShutdown();
    },
  };
  class MockDownloadItService {
    constructor() {
      events.push("service-constructed");
      return serviceInstance;
    }
  }
  const serviceModule = {
    DownloadItService: MockDownloadItService,
    registerActiveService() {
      events.push("service-registered");
    },
    unregisterActiveService(service) {
      events.push("service-unregistered");
      unregisteredService = service;
      return serviceUnregister(service);
    },
  };
  const ariaNgModule = {
    async startAriaNg(_data, reason) {
      events.push(`ariang-startup:${reason}`);
      return ariaNgStartup(reason);
    },
    async stopAriaNg(reason) {
      events.push(`ariang-shutdown:${reason}`);
      return ariaNgShutdown(reason);
    },
  };
  const context = vm.createContext({
    ADDON_DISABLE: 4,
    ADDON_UNINSTALL: 6,
    APP_SHUTDOWN: 2,
    APP_STARTUP: 1,
    AsyncShutdown: {
      profileBeforeChange: {
        addBlocker(name, fn) {
          const blocker = { name, fn, removed: false };
          asyncShutdownBlockers.push(blocker);
          return {
            remove() {
              blocker.removed = true;
            },
          };
        },
      },
    },
    ChromeUtils: {
      importESModule(spec) {
        if (spec.includes("AsyncShutdown")) {
          return { AsyncShutdown: context.AsyncShutdown };
        }
        return spec.includes("DownloadItAriaNg")
          ? ariaNgModule
          : serviceModule;
      },
      unloadESModule(spec) {
        unloadedModules.push(spec);
      },
    },
    Components: {
      classes: {},
      interfaces: {},
      utils: {
        reportError(error) {
          reportedErrors.push(error);
        },
      },
    },
    console,
    Promise,
    Services: {
      dirsvc: {
        get() {
          return createProfileFile("C:\\Profile");
        },
      },
      prefs: {
        getBoolPref(_name, fallback) {
          return keepProfileData ?? fallback;
        },
      },
    },
  });
  vm.runInContext(bootstrapSource, context, { filename: "bootstrap.js" });

  return {
    asyncShutdownBlockers,
    context,
    events,
    reportedErrors,
    serviceInstance,
    removedPaths,
    unloadedModules,
    get unregisteredService() {
      return unregisteredService;
    },
  };
}

test("bootstrap starts AriaNg before the DownloadIt service", async () => {
  const fixture = createBootstrapContext();

  await fixture.context.startup(
    { version: "test" },
    fixture.context.APP_STARTUP,
  );

  assert.deepEqual(fixture.events, [
    "ariang-startup:APP_STARTUP",
    "service-constructed",
    "service-registered",
    "service-startup",
  ]);
});

test("bootstrap startup rolls back AriaNg when the service fails", async () => {
  const startupError = new Error("service failed");
  const fixture = createBootstrapContext({
    serviceStartup: async () => {
      throw startupError;
    },
  });

  await assert.rejects(
    fixture.context.startup(
      { version: "test" },
      fixture.context.APP_STARTUP,
    ),
    startupError,
  );

  assert.equal(fixture.unregisteredService, fixture.serviceInstance);
  assert.deepEqual(fixture.events, [
    "ariang-startup:APP_STARTUP",
    "service-constructed",
    "service-registered",
    "service-startup",
    "service-shutdown",
    "service-unregistered",
    "ariang-shutdown:ADDON_DISABLE",
  ]);
});

test("service rollback errors do not leave AriaNg active", async () => {
  const startupError = new Error("service failed");
  const shutdownError = new Error("service shutdown failed");
  const unregisterError = new Error("service unregister failed");
  const fixture = createBootstrapContext({
    serviceStartup: async () => {
      throw startupError;
    },
    serviceShutdown: async () => {
      throw shutdownError;
    },
    serviceUnregister: () => {
      throw unregisterError;
    },
  });

  await assert.rejects(
    fixture.context.startup(
      { version: "test" },
      fixture.context.APP_STARTUP,
    ),
    startupError,
  );

  assert.deepEqual(
    fixture.reportedErrors,
    [shutdownError, unregisterError, startupError],
  );
  assert.equal(fixture.events.at(-1), "ariang-shutdown:ADDON_DISABLE");
});

test("bootstrap shutdown waits for service and AriaNg cleanup", async () => {
  let finishAriaNgShutdown;
  let finishServiceShutdown;
  const ariaNgShutdownGate = new Promise(resolve => {
    finishAriaNgShutdown = resolve;
  });
  const serviceShutdownGate = new Promise(resolve => {
    finishServiceShutdown = resolve;
  });
  const fixture = createBootstrapContext({
    ariaNgShutdown: () => ariaNgShutdownGate,
    serviceShutdown: () => serviceShutdownGate,
  });

  await fixture.context.startup(
    { version: "test" },
    fixture.context.APP_STARTUP,
  );
  let settled = false;
  const result = fixture.context.shutdown({}, fixture.context.APP_SHUTDOWN);
  result.then(() => {
    settled = true;
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.match(fixture.events.at(-1), /^service-shutdown$/);
  assert.doesNotMatch(fixture.events.join("\n"), /ariang-shutdown/);

  finishServiceShutdown();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(
    fixture.events.at(-1),
    /^ariang-shutdown:APP_SHUTDOWN$/,
  );
  assert.equal(settled, false);

  finishAriaNgShutdown();
  await result;
  assert.equal(settled, true);
  assert.equal(fixture.unregisteredService, fixture.serviceInstance);
  assert.deepEqual(fixture.unloadedModules, []);
});

test("non-app shutdown unloads both DownloadIt modules", async () => {
  const fixture = createBootstrapContext();

  await fixture.context.startup({ version: "test" });
  await fixture.context.shutdown({}, fixture.context.ADDON_DISABLE);

  assert.deepEqual(fixture.events.slice(-3), [
    "service-shutdown",
    "service-unregistered",
    "ariang-shutdown:ADDON_DISABLE",
  ]);
  assert.equal(fixture.unloadedModules.length, 2);
  assert.ok(fixture.unloadedModules.some(spec => spec.includes("DownloadItService")));
  assert.ok(fixture.unloadedModules.some(spec => spec.includes("DownloadItAriaNg")));
});

test("service shutdown errors do not skip unregistering or module cleanup", async () => {
  const shutdownError = new Error("service cleanup failed");
  const fixture = createBootstrapContext({
    serviceShutdown: async () => {
      throw shutdownError;
    },
  });

  await fixture.context.startup({ version: "test" });
  await fixture.context.shutdown({}, fixture.context.ADDON_DISABLE);

  assert.equal(fixture.unregisteredService, fixture.serviceInstance);
  assert.deepEqual(fixture.reportedErrors, [shutdownError]);
  assert.equal(fixture.unloadedModules.length, 2);
});

test("async shutdown barrier is registered during startup", async () => {
  const fixture = createBootstrapContext();

  await fixture.context.startup({ version: "test" });

  assert.equal(fixture.asyncShutdownBlockers.length, 1);
  assert.equal(
    fixture.asyncShutdownBlockers[0].name,
    "DownloadIt: shutdown",
  );
  assert.equal(fixture.asyncShutdownBlockers[0].removed, false);
});

test("async shutdown barrier awaits the shutdown promise", async () => {
  let finishServiceShutdown;
  const serviceShutdownGate = new Promise(resolve => {
    finishServiceShutdown = resolve;
  });
  const fixture = createBootstrapContext({
    serviceShutdown: () => serviceShutdownGate,
  });

  await fixture.context.startup({ version: "test" });
  fixture.context.shutdown({}, fixture.context.APP_SHUTDOWN);

  const blockerPromise = fixture.asyncShutdownBlockers[0].fn();
  assert.equal(typeof blockerPromise.then, "function");

  finishServiceShutdown();
  await blockerPromise;
});

test("uninstall removes managed binaries and keeps profile data by default", async () => {
  const fixture = createBootstrapContext();

  await fixture.context.startup({ version: "test" });
  await fixture.context.uninstall({}, fixture.context.ADDON_UNINSTALL);

  assert.equal(fixture.asyncShutdownBlockers[0].removed, true);
  assert.deepEqual(fixture.removedPaths, [
    { path: "C:\\Profile\\DownloadIt\\FlashGot.exe", recursive: false },
    { path: "C:\\Profile\\DownloadIt\\aria2-next.exe", recursive: false },
    { path: "C:\\Profile\\DownloadIt\\aria2-next", recursive: false },
  ]);
  assert.equal(
    fixture.removedPaths.some(item => item.recursive),
    false,
  );
});

test("uninstall removes the profile directory when retention is disabled", async () => {
  const fixture = createBootstrapContext({ keepProfileData: false });

  await fixture.context.startup({ version: "test" });
  await fixture.context.uninstall({}, fixture.context.ADDON_UNINSTALL);

  assert.deepEqual(fixture.removedPaths.at(-1), {
    path: "C:\\Profile\\DownloadIt",
    recursive: true,
  });
});
