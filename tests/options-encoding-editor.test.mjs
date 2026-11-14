import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { normalizeFilenameEncodings } from "../addon/chrome/content/DownloadItFilename.sys.mjs";

const source = readFileSync(new URL("../addon/chrome/content/options.js", import.meta.url), "utf8");
const handlers = source.slice(source.indexOf("// Independent draft:"), source.indexOf("function renderDownloadDialogSettings()"));
class Element {
  constructor() { this.children = []; this.listeners = {}; this.value = ""; this.hidden = false; this.disabled = false; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  click() { if (!this.disabled) this.listeners.click?.(); }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function setup(encodings = [], enabled = true) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const state = { draft: { downloadDialog: { filenameEncodings: [...encodings], detectFilenameEncoding: enabled } }, busy: false };
  let renders = 0;
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element(), documentElement: { lang: "en-US" } },
    state, window: {}, Intl, normalizeFilenameEncodings,
    setLocalized: (element, id, args) => { element.l10nId = id; element.l10nArgs = args; },
    renderDownloadDialogSettings: () => renders++, renderActionState: () => {},
  });
  vm.runInContext(handlers, context);
  context.bindFilenameEncodingEditor();
  context.syncFilenameEncodingAccess();
  return { get, state, context, renders: () => renders };
}

test("encoding entry follows the detection toggle and guards disabled activation", () => {
  const { get, state, context } = setup([], false);
  assert.equal(get("manage-filename-encodings").disabled, true);
  get("manage-filename-encodings").listeners.click();
  assert.equal(Boolean(get("filename-encoding-editor").open), false);
  state.draft.downloadDialog.detectFilenameEncoding = true;
  context.syncFilenameEncodingAccess();
  get("manage-filename-encodings").click();
  assert.equal(get("filename-encoding-editor").open, true);
});

test("encoding dialog adds on Enter, deduplicates, removes, and stages only on Done", () => {
  const { get, state, renders } = setup(["koi8-r"]);
  get("manage-filename-encodings").click();
  const input = get("download-dialog-extra-encodings");
  input.value = "cp1251, windows-1251";
  input.listeners.keydown({ key: "Enter", isComposing: false, preventDefault() {} });
  assert.equal(input.value, "");
  assert.equal(get("filename-encoding-list").children.length, 2);
  assert.deepEqual(state.draft.downloadDialog.filenameEncodings, ["koi8-r"]);
  get("filename-encoding-list").children[0].children[1].click();
  get("filename-encoding-save").click();
  assert.deepEqual([...state.draft.downloadDialog.filenameEncodings], ["windows-1251"]);
  assert.equal(renders(), 1);
});

test("invalid batch is atomic and Cancel or native Escape discards dialog changes", () => {
  const { get, state } = setup(["koi8-r"]);
  get("manage-filename-encodings").click();
  const input = get("download-dialog-extra-encodings");
  input.value = "cp1251 unsupported-label";
  get("filename-encoding-save").click();
  assert.equal(get("filename-encoding-error").hidden, false);
  assert.equal(get("filename-encoding-editor").open, true);
  assert.equal(get("filename-encoding-list").children.length, 1);
  input.value = "cp1251";
  get("add-filename-encoding").click();
  get("filename-encoding-cancel").click();
  assert.deepEqual(state.draft.downloadDialog.filenameEncodings, ["koi8-r"]);
  get("manage-filename-encodings").click();
  assert.equal(get("filename-encoding-list").children.length, 1);
  get("filename-encoding-presets").children[8].click();
  get("filename-encoding-editor").close(); // Native Escape closes without saving.
  get("manage-filename-encodings").click();
  assert.equal(get("filename-encoding-list").children.length, 1);
});

test("ten language presets add only Firefox-supported encodings and disable duplicates", () => {
  const { get, state } = setup();
  get("manage-filename-encodings").click();
  assert.equal(get("filename-encoding-presets").children.length, 10);
  for (let index = 0; index < 10; index++) get("filename-encoding-presets").children[index].click();
  assert.ok(get("filename-encoding-presets").children.every(button => button.disabled));
  get("filename-encoding-save").click();
  const labels = [...state.draft.downloadDialog.filenameEncodings];
  assert.deepEqual(labels, normalizeFilenameEncodings(labels));
  assert.ok(labels.includes("windows-1256"));
  assert.ok(labels.includes("windows-1251"));
  assert.ok(labels.includes("utf-8"));
});
