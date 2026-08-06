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

test("bootstrap shutdown returns and waits for service cleanup", async () => {
  let finishShutdown;
  let unregisteredService = null;
  const shutdownGate = new Promise(resolve => {
    finishShutdown = resolve;
  });
  const serviceInstance = {
    startup: async () => {},
    shutdown: () => shutdownGate,
  };
  class MockDownloadItService {
    constructor() {
      return serviceInstance;
    }
  }
  const serviceModule = {
    DownloadItService: MockDownloadItService,
    registerActiveService() {},
    unregisterActiveService(service) {
      unregisteredService = service;
    },
  };
  const context = vm.createContext({
    APP_SHUTDOWN: 2,
    ChromeUtils: {
      importESModule: () => serviceModule,
      unloadESModule() {},
    },
    Components: {
      classes: {},
      interfaces: {},
      utils: { reportError() {} },
    },
    console,
    Promise,
    Services: {},
  });
  vm.runInContext(bootstrapSource, context, { filename: "bootstrap.js" });

  await context.startup({ version: "test" });
  let settled = false;
  const result = context.shutdown({}, context.APP_SHUTDOWN);
  assert.equal(typeof result?.then, "function");
  result.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(unregisteredService, null);

  finishShutdown();
  await result;
  assert.equal(settled, true);
  assert.equal(unregisteredService, serviceInstance);
});
