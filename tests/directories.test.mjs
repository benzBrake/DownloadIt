import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_DIRECTORIES, defaultDownloadDirectories, readDownloadDirectories,
  resolveDownloadDirectories, validateDownloadDirectories,
  resolveDownloadDirectory, parseXDGPicturesDirectory,
} from "../addon/chrome/content/DownloadItDirectories.sys.mjs";

function components(folders = {}) {
  return { interfaces: {}, classes: {
    "@mozilla.org/file/directory_service;1": { getService: () => ({
      get(key) {
        if (!folders[key]) throw new Error("unavailable");
        return { path: folders[key], exists: () => true, isDirectory: () => true };
      },
    }) },
    "@mozilla.org/file/local;1": { createInstance: () => ({
      initWithPath(path) {
        if (!/^[A-Z]:\\/i.test(path) && !path.startsWith("\\\\")) {
          throw new Error("NS_ERROR_FILE_UNRECOGNIZED_PATH");
        }
        this.path = path;
      },
      exists() { return !this.path.includes("missing"); },
      isDirectory() { return !this.path.endsWith(".txt"); },
    }) },
  } };
}

test("legacy preferences gain defaults without losing 30 ordinary directories or labels", () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ path: `C:\\${i}`, label: `${i}` }));
  assert.deepEqual(readDownloadDirectories({ directories: entries }),
    [...defaultDownloadDirectories(), ...entries]);
  assert.deepEqual(readDownloadDirectories({}), defaultDownloadDirectories());
  assert.equal(entries.length, 30);
});

function picturesComponents({ os, config = '', environment = {}, registry = {}, missing = false }) {
  const calls = { closedKeys: 0, closedStreams: 0 };
  const api = components({ Home: "/home/test" });
  api.classes["@mozilla.org/process/environment;1"] = {
    getService: () => ({ get: name => environment[name] || "" }),
  };
  api.classes["@mozilla.org/file/local;1"] = { createInstance: () => ({
    initWithPath(path) {
      if (!(os === 'WINNT' ? /^[A-Z]:\\/iu.test(path) : path.startsWith('/'))) {
        throw new Error('NS_ERROR_FILE_UNRECOGNIZED_PATH');
      }
      this.path = path;
    },
    append(name) { this.path += `/${name}`; },
    exists: () => !missing, isDirectory: () => true,
  }) };
  api.classes["@mozilla.org/windows-registry-key;1"] = { createInstance: () => ({
    ROOT_KEY_CURRENT_USER: 1, ACCESS_READ: 1,
    open(_root, path) { calls.registryPath = path; },
    readStringValue(name) {
      assert.equal(name, "My Pictures");
      const value = registry[calls.registryPath.split('\\').at(-1)];
      if (value === undefined) throw new Error('missing value');
      return value;
    },
    close() { calls.closedKeys++; },
  }) };
  api.classes["@mozilla.org/network/file-input-stream;1"] = { createInstance: () => ({
    init(file) { calls.configPath = file.path; }, close() { calls.closedStreams++; },
  }) };
  api.classes["@mozilla.org/intl/converter-input-stream;1"] = { createInstance: () => ({
    init() {}, done: false,
    readString(_size, output) {
      if (this.done) return 0;
      this.done = true; output.value = config; return config.length;
    },
    close() { calls.closedStreams++; },
  }) };
  return { api, calls };
}

test("Windows pictures use redirected shell folders and expand environment values", () => {
  const { api, calls } = picturesComponents({ os: 'WINNT',
    environment: { OneDrive: 'D:\\Cloud' },
    registry: { 'User Shell Folders': '%OneDrive%\\相册' },
  });
  assert.equal(resolveDownloadDirectory('{pictures}', api, 'WINNT').path, 'D:\\Cloud\\相册');
  assert.equal(calls.closedKeys, 1);
  const fallback = picturesComponents({ os: 'WINNT', registry: { 'Shell Folders': 'E:\\Photos' } });
  assert.equal(resolveDownloadDirectory('{pictures}', fallback.api, 'WINNT').path, 'E:\\Photos');
  assert.equal(fallback.calls.closedKeys, 2);
  assert.equal(resolveDownloadDirectory('{pictures}', picturesComponents({ os: 'WINNT' }).api, 'WINNT'), null);
});

test("Linux pictures honor XDG config location, HOME, absolute paths, and unavailable folders", () => {
  const fixture = picturesComponents({ os: 'Linux', environment: { XDG_CONFIG_HOME: '/custom/config' },
    config: 'XDG_PICTURES_DIR="$HOME/相册"\n',
  });
  assert.equal(resolveDownloadDirectory('{pictures}', fixture.api, 'Linux').path, '/home/test/相册');
  assert.equal(fixture.calls.configPath, '/custom/config/user-dirs.dirs');
  assert.equal(fixture.calls.closedStreams, 2);
  const absolute = picturesComponents({ os: 'Linux', environment: { XDG_CONFIG_HOME: 'relative' },
    config: 'XDG_PICTURES_DIR="/mnt/photos"',
  });
  assert.equal(resolveDownloadDirectory('{pictures}', absolute.api, 'Linux').path, '/mnt/photos');
  assert.equal(absolute.calls.configPath, '/home/test/.config/user-dirs.dirs');
  for (const config of ['', 'XDG_PICTURES_DIR="$HOME"', 'XDG_PICTURES_DIR="$(command)"']) {
    assert.equal(resolveDownloadDirectory('{pictures}', picturesComponents({ os: 'Linux', config }).api, 'Linux'), null);
  }
  assert.equal(resolveDownloadDirectory('{pictures}', picturesComponents({ os: 'Linux',
    config: 'XDG_PICTURES_DIR="/missing"', missing: true }).api, 'Linux'), null);
});

test("XDG parsing treats quoted escapes as data and never evaluates shell syntax", () => {
  assert.equal(parseXDGPicturesDirectory('# comment\nXDG_PICTURES_DIR="$HOME/My Photos"', '/home/test'), '/home/test/My Photos');
  assert.equal(parseXDGPicturesDirectory('XDG_PICTURES_DIR="/photos/\\$literal"', '/home/test'), '/photos/$literal');
  for (const value of ['"relative"', '"/photos/$OTHER"', '"/photos/`command`"', '"/photos/$(command)"', '/unquoted']) {
    assert.equal(parseXDGPicturesDirectory(`XDG_PICTURES_DIR=${value}`, '/home/test'), null);
  }
});

test("explicit empty lists survive save and reload without restoring built-ins", () => {
  const value = { directoryFormat: 1, directories: [] };
  const directories = validateDownloadDirectories(value.directories, components(), "WINNT");
  assert.deepEqual(readDownloadDirectories(JSON.parse(JSON.stringify({ ...value, directories }))), []);
});

test("native nsIFile paths validate and resolve without an isAbsolute method", () => {
  const api = components();
  const entries = [
    { path: "F:\\下载", label: "Downloads" },
    { path: "\\\\server\\share\\Downloads", label: "Shared" },
  ];
  assert.equal("isAbsolute" in api.classes["@mozilla.org/file/local;1"].createInstance(), false);
  assert.deepEqual(validateDownloadDirectories(entries, api, "WINNT"), entries);
  assert.deepEqual(resolveDownloadDirectories(entries, api, "WINNT").map(({ path }) => path),
    entries.map(({ path }) => path));
  assert.equal(resolveDownloadDirectory("relative", api, "WINNT"), null);
});

test("built-in placeholders survive unavailable directories and retain optional names", () => {
  const entries = defaultDownloadDirectories();
  entries[0].label = "Work";
  const saved = validateDownloadDirectories(entries, components(), "WINNT");
  assert.deepEqual(saved, entries);
  assert.deepEqual(resolveDownloadDirectories(saved, components(), "WINNT"), []);
  const available = resolveDownloadDirectories(saved, components({ Desk: "C:\\Desktop" }), "WINNT");
  assert.deepEqual(available, [{ path: "C:\\Desktop", label: "Work", messageId: null }]);
  assert.equal(resolveDownloadDirectories(entries.slice(1), components({ Docs: "C:\\Docs" }), "WINNT")[0].messageId,
    "downloadit-dialog-directory-documents");
});

test("runtime paths follow the system and deduplicate in configured order", () => {
  const entries = [{ path: "{desktop}", label: "First" }, { path: "C:\\DESKTOP", label: "Second" }];
  assert.equal(resolveDownloadDirectories(entries, components({ Desk: "C:\\Desktop" }), "WINNT").length, 1);
  assert.equal(resolveDownloadDirectories(entries, components({ Desk: "C:\\Moved" }), "WINNT")[0].path, "C:\\Moved");
  assert.equal(entries[0].path, "{desktop}");
  assert.equal(resolveDownloadDirectories(entries, components({ Desk: "C:\\Desktop" }), "Linux").length, 2);
});

test("validation enforces placeholders, ordinary paths, counts, and case-aware duplicates", () => {
  for (const path of ["{unknown}", "relative", "C:\\missing", "C:\\file.txt", "C:\\bad\nname"]) {
    assert.throws(() => validateDownloadDirectories([{ path }], components(), "WINNT"));
  }
  const entries = Array.from({ length: 30 }, (_, i) => ({ path: `C:\\${i}`, label: "" }));
  assert.equal(validateDownloadDirectories([...defaultDownloadDirectories(), ...entries], components(), "WINNT").length, 34);
  assert.throws(() => validateDownloadDirectories([...entries, { path: "C:\\extra" }], components(), "WINNT"));
  const repeated = [{ path: "{desktop}" }, { path: "{desktop}" }, { path: "C:\\A" }, { path: "c:\\a" }];
  assert.equal(validateDownloadDirectories(repeated, components(), "WINNT").length, 2);
  assert.equal(validateDownloadDirectories(repeated, components(), "Linux").length, 3);
  assert.deepEqual(defaultDownloadDirectories().map(entry => entry.path), BUILTIN_DIRECTORIES.map(entry => entry.path));
});
