import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../addon/chrome/content/options.js", import.meta.url), "utf8");
const handler = source.slice(
  source.indexOf("async function addDownloadDialogDirectory()"),
  source.indexOf("function renderActionState()"),
);

function setup({ legacy = false, result = 0, directories = [] } = {}) {
  const window = {
    browsingContext: { originAttributes: legacy ? { inIsolatedMozBrowser: false } : {} },
    Services: { appinfo: { OS: "WINNT" } },
  };
  const calls = { opened: 0, rendered: 0, actionState: 0 };
  const picker = {
    file: { path: "C:\\Downloads", leafName: "Downloads" },
    init(parent, title, mode) {
      // Model the native interface boundary that rejected a DOM window.
      assert.equal(parent, legacy ? window : window.browsingContext);
      assert.equal(title, "Choose folder");
      assert.equal(mode, 2);
    },
    open(callback) { calls.opened++; callback(result); },
  };
  const context = vm.createContext({
    window,
    document: { l10n: {
      ready: Promise.resolve(),
      formatValue: async id => {
        assert.equal(id, "downloadit-dialog-directory-picker");
        return "Choose folder";
      },
    } },
    Cc: { "@mozilla.org/filepicker;1": { createInstance: () => picker } },
    Ci: { nsIFilePicker: { modeGetFolder: 2, returnOK: 0 } },
    state: { draft: { downloadDialog: { directories } } },
    getBuiltinDirectory: () => null,
    renderDownloadDialogSettings: () => calls.rendered++,
    renderActionState: () => calls.actionState++,
  });
  vm.runInContext(handler, context);
  return { run: () => context.addDownloadDialogDirectory(), directories, calls };
}

for (const legacy of [false, true]) {
  test(`add folder opens the picker and stages the selection (${legacy ? "legacy window" : "BrowsingContext"})`, async () => {
    const { run, directories, calls } = setup({ legacy });
    await run();
    assert.equal(calls.opened, 1);
    assert.equal(directories.length, 1);
    assert.equal(directories[0].path, "C:\\Downloads");
    assert.equal(directories[0].label, "Downloads");
    assert.equal(calls.rendered, 1);
    assert.equal(calls.actionState, 1);
  });
}

test("canceling folder selection leaves settings unchanged", async () => {
  const { run, directories, calls } = setup({ result: 1 });
  await run();
  assert.equal(calls.opened, 1);
  assert.equal(directories.length, 0);
  assert.equal(calls.rendered, 0);
  assert.equal(calls.actionState, 0);
});

test("selecting an existing Windows folder does not add a duplicate", async () => {
  const { run, directories, calls } = setup({ directories: [{ path: "c:\\downloads", label: "Existing" }] });
  await run();
  assert.equal(calls.opened, 1);
  assert.equal(directories.length, 1);
  assert.equal(directories[0].label, "Existing");
  assert.equal(calls.rendered, 0);
});
