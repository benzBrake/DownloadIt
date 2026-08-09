import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  registerDownloadItExternalProtocolHook,
  unregisterDownloadItExternalProtocolHook,
} from "../addon/chrome/content/DownloadItExternalProtocol.sys.mjs";

const projectRoot = new URL("../", import.meta.url);

function createChooser() {
  class MockChooser {
    handleURI(...args) {
      this.nativeCalls = (this.nativeCalls || 0) + 1;
      this.nativeArgs = args;
    }
  }
  return MockChooser;
}

test("external protocol hook routes magnet and ed2k without Firefox UI", async () => {
  const Chooser = createChooser();
  const calls = [];
  const service = {
    getProtocolDefaultManager: protocol => `${protocol}-manager`,
    async downloadProtocolURI(args) {
      calls.push(args);
    },
  };
  const chooser = new Chooser();
  const magnet = { scheme: "magnet", spec: "magnet:?xt=urn:btih:test" };
  const ed2k = { scheme: "ed2k", spec: "ed2k://|file|Example.bin|4|0123456789ABCDEF|/" };

  assert.equal(registerDownloadItExternalProtocolHook(service, {
    chooserConstructor: Chooser,
  }), true);
  try {
    await chooser.handleURI({}, magnet, "principal", "context", false);
    await chooser.handleURI({}, ed2k, "principal", "context", false);
    assert.deepEqual(calls.map(call => call.manager), [
      "magnet-manager",
      "ed2k-manager",
    ]);
    assert.equal(chooser.nativeCalls || 0, 0);
  } finally {
    unregisterDownloadItExternalProtocolHook(service);
  }
});

test("external protocol hook keeps unconfigured and externally triggered URIs native", async () => {
  const Chooser = createChooser();
  let downloads = 0;
  const service = {
    getProtocolDefaultManager: () => "",
    async downloadProtocolURI() {
      downloads += 1;
    },
  };
  const chooser = new Chooser();
  assert.equal(registerDownloadItExternalProtocolHook(service, {
    chooserConstructor: Chooser,
  }), true);
  try {
    await chooser.handleURI({}, { scheme: "magnet", spec: "magnet:?x" }, null, null, false);
    await chooser.handleURI({}, { scheme: "ed2k", spec: "ed2k://x" }, null, null, true);
    assert.equal(downloads, 0);
    assert.equal(chooser.nativeCalls, 2);
  } finally {
    unregisterDownloadItExternalProtocolHook(service);
  }
});

test("external protocol hook falls back when provider submission fails", async () => {
  const Chooser = createChooser();
  const service = {
    getProtocolDefaultManager: () => "magnet-manager",
    async downloadProtocolURI() {
      throw new Error("offline");
    },
  };
  const chooser = new Chooser();
  const originalError = console.error;
  console.error = () => {};
  assert.equal(registerDownloadItExternalProtocolHook(service, {
    chooserConstructor: Chooser,
  }), true);
  try {
    await chooser.handleURI({}, { scheme: "magnet", spec: "magnet:?x" }, null, null, false);
    assert.equal(chooser.nativeCalls, 1);
  } finally {
    console.error = originalError;
    unregisterDownloadItExternalProtocolHook(service);
  }
});

test("external protocol hook falls back when the default lookup fails", async () => {
  const Chooser = createChooser();
  const service = {
    getProtocolDefaultManager() {
      throw new Error("preference unavailable");
    },
  };
  const chooser = new Chooser();
  const originalError = console.error;
  console.error = () => {};
  assert.equal(registerDownloadItExternalProtocolHook(service, {
    chooserConstructor: Chooser,
  }), true);
  try {
    await chooser.handleURI({}, { scheme: "magnet", spec: "magnet:?x" }, null, null, false);
    assert.equal(chooser.nativeCalls, 1);
  } finally {
    console.error = originalError;
    unregisterDownloadItExternalProtocolHook(service);
  }
});

test("external protocol hook registration is idempotent and restores the chooser", () => {
  const Chooser = createChooser();
  const original = Chooser.prototype.handleURI;
  const service = { getProtocolDefaultManager: () => "" };
  assert.equal(registerDownloadItExternalProtocolHook(service, {
    chooserConstructor: Chooser,
  }), true);
  const wrapped = Chooser.prototype.handleURI;
  assert.equal(registerDownloadItExternalProtocolHook(service, {
    chooserConstructor: Chooser,
  }), true);
  assert.equal(Chooser.prototype.handleURI, wrapped);
  unregisterDownloadItExternalProtocolHook(service);
  assert.equal(Chooser.prototype.handleURI, original);
});

test("external protocol hook is included by both packaging scripts", () => {
  for (const script of ["pack.ps1", "pack.sh"]) {
    const source = readFileSync(new URL(script, projectRoot), "utf8");
    assert.match(source, /chrome[\\/]content[\\/]DownloadItExternalProtocol\.sys\.mjs/);
  }
});
