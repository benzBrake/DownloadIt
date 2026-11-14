export const DIRECTORY_FORMAT = 1;
export const BUILTIN_DIRECTORIES = Object.freeze([
  ["desktop", "Desk"],
  ["documents", "Docs"],
  ["pictures", null],
  ["downloads", "DfltDwnld"],
].map(([name, key]) => Object.freeze({
  path: `{${name}}`, key, messageId: `downloadit-dialog-directory-${name}`,
})));

export function getBuiltinDirectory(path) {
  return BUILTIN_DIRECTORIES.find(entry => entry.path === path);
}

export function defaultDownloadDirectories() {
  return BUILTIN_DIRECTORIES.map(({ path }) => ({ path, label: "" }));
}

// user-dirs.dirs is data, not a shell script. Expand only the XDG-defined HOME
// prefix and quoted escapes; never evaluate substitutions or other variables.
export function parseXDGPicturesDirectory(text, home) {
  let result = null;
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*XDG_PICTURES_DIR="((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/u.exec(line);
    if (!match) continue;
    let value = match[1];
    if (value === "$HOME" || value.startsWith("$HOME/")) {
      value = home + value.slice(5);
    } else if (!value.startsWith("/")) {
      continue;
    }
    // Reject unescaped shell syntax, while preserving escaped literal characters.
    if (/(^|[^\\])(?:\\\\)*[$`]/u.test(value)) continue;
    value = value.replace(/\\([\\"$`])/gu, "$1");
    if (/[\u0000-\u001f]/u.test(value)) continue;
    result = value;
  }
  return result;
}

function getPicturesDirectory(Cc, Ci, directoryService, os) {
  const environment = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  if (os === "WINNT") {
    for (const folderKey of ["User Shell Folders", "Shell Folders"]) {
      const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
      try {
        key.open(key.ROOT_KEY_CURRENT_USER,
          `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\${folderKey}`, key.ACCESS_READ);
        const path = key.readStringValue("My Pictures").replace(/%([^%]+)%/gu,
          (match, name) => environment.get(name) || match);
        if (/%[^%]+%/u.test(path)) continue;
        file.initWithPath(path);
        return file;
      } catch {
        // The legacy expanded Shell Folders value is a fallback for older profiles.
      } finally {
        try { key.close(); } catch {}
      }
    }
    return null;
  }
  if (os !== "Linux") return null;
  const home = directoryService.get("Home", Ci.nsIFile).path;
  const configHome = environment.get("XDG_CONFIG_HOME");
  const config = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  config.initWithPath(configHome.startsWith("/") ? configHome : `${home}/.config`);
  config.append("user-dirs.dirs");
  const input = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
  const converter = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
  let text = "";
  try {
    input.init(config, 0x01, 0, 0);
    converter.init(input, "UTF-8", 0, 0);
    const chunk = {};
    while (converter.readString(4096, chunk)) {
      text += chunk.value;
      if (text.length > 65536) return null;
    }
  } finally {
    try { converter.close(); } finally { input.close(); }
  }
  const path = parseXDGPicturesDirectory(text, home);
  if (!path || path.replace(/\/+$/u, "") === home.replace(/\/+$/u, "")) return null;
  file.initWithPath(path);
  return file;
}

export function resolveDownloadDirectory(path, components = globalThis.Components,
  os = globalThis.Services?.appinfo?.OS) {
  try {
    const { classes: Cc, interfaces: Ci } = components;
    const builtin = getBuiltinDirectory(path);
    if (!builtin && path.startsWith("{")) return null;
    let file;
    if (builtin) {
      const directoryService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
      file = builtin.path === "{pictures}"
        ? getPicturesDirectory(Cc, Ci, directoryService, os)
        : directoryService.get(builtin.key, Ci.nsIFile);
    } else {
      file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      // nsIFile rejects invalid paths in initWithPath; it has no isAbsolute().
      file.initWithPath(path);
    }
    return file?.exists() && file.isDirectory() ? file : null;
  } catch {
    return null;
  }
}

// Reading old preferences must not persist a migration until Apply is used.
export function readDownloadDirectories(value) {
  const entries = Array.isArray(value.directories) ? value.directories : [];
  const source = value.directoryFormat === DIRECTORY_FORMAT
    ? entries : [...defaultDownloadDirectories(), ...entries];
  const seen = new Set();
  let ordinary = 0;
  return source.flatMap(entry => {
    if (typeof entry?.path !== "string") return [];
    const path = entry.path.trim();
    if (!path || /[\u0000-\u001f]/u.test(path)) return [];
    const builtin = getBuiltinDirectory(path);
    if (!builtin && path.startsWith("{")) return [];
    if (builtin) {
      if (seen.has(path)) return [];
      seen.add(path);
    } else if (++ordinary > 30) {
      return [];
    }
    return [{ path, label: String(entry.label || "").trim().slice(0, 100) }];
  });
}

export function validateDownloadDirectories(entries, components, os) {
  if (!Array.isArray(entries) || entries.length > 34) throw new Error("invalid directories");
  const result = [];
  const seen = new Set();
  let ordinary = 0;
  for (const entry of entries) {
    if (typeof entry?.path !== "string") throw new Error("invalid directory");
    let path = entry.path.trim();
    if (!path || /[\u0000-\u001f]/u.test(path)) throw new Error("invalid directory");
    const builtin = getBuiltinDirectory(path);
    if (!builtin) {
      if (++ordinary > 30) throw new Error("too many directories");
      const file = resolveDownloadDirectory(path, components, os);
      if (!file) throw new Error("invalid directory");
      path = file.path;
    }
    const key = os === "WINNT" ? path.toLowerCase() : path;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ path, label: String(entry.label || "").trim().slice(0, 100) });
  }
  return result;
}

export function resolveDownloadDirectories(entries, components, os) {
  const seen = new Set();
  return entries.flatMap(entry => {
    const file = resolveDownloadDirectory(entry.path, components, os);
    if (!file) return [];
    const key = os === "WINNT" ? file.path.toLowerCase() : file.path;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ path: file.path, label: entry.label,
      messageId: entry.label ? null : getBuiltinDirectory(entry.path)?.messageId }];
  });
}

export function getUncoveredWindowsDrives(entries, components, os) {
  if (os !== "WINNT") return [];
  const { classes: Cc, interfaces: Ci } = components;
  const covered = new Set(entries.flatMap(entry => {
    const file = resolveDownloadDirectory(entry.path, components, os);
    const match = /^([a-z]):\\/iu.exec(file?.path || "");
    return match ? [match[1].toUpperCase()] : [];
  }));
  const drives = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (covered.has(letter)) continue;
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    try {
      file.initWithPath(`${letter}:\\`);
      if (file.exists() && file.isDirectory()) {
        drives.push({ path: file.path, label: file.path, messageId: null });
      }
    } catch {
      // A drive letter may be invalid or unavailable on this system.
    }
  }
  return drives;
}
