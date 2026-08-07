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
} = {}) {
  const events = [];
  const reportedErrors = [];
  const unloadedModules = [];
  let unregisteredService = null;

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
    APP_SHUTDOWN: 2,
    APP_STARTUP: 1,
    ChromeUtils: {
      importESModule(spec) {
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
    Services: {},
  });
  vm.runInContext(bootstrapSource, context, { filename: "bootstrap.js" });

  return {
    context,
    events,
    reportedErrors,
    serviceInstance,
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
    "service-unregistered",
    "ariang-shutdown:ADDON_DISABLE",
  ]);
});

test("service rollback errors do not leave AriaNg active", async () => {
  const startupError = new Error("service failed");
  const unregisterError = new Error("service unregister failed");
  const fixture = createBootstrapContext({
    serviceStartup: async () => {
      throw startupError;
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

  assert.deepEqual(fixture.reportedErrors, [unregisterError, startupError]);
  assert.equal(fixture.events.at(-1), "ariang-shutdown:ADDON_DISABLE");
});

test("bootstrap shutdown waits for AriaNg and service cleanup", async () => {
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
  assert.match(fixture.events.at(-1), /^ariang-shutdown:APP_SHUTDOWN$/);
  assert.doesNotMatch(fixture.events.join("\n"), /service-shutdown/);

  finishAriaNgShutdown();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(fixture.events.join("\n"), /service-shutdown/);
  assert.equal(settled, false);

  finishServiceShutdown();
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
    "ariang-shutdown:ADDON_DISABLE",
    "service-shutdown",
    "service-unregistered",
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
