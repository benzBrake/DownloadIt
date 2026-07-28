export const AUTO_CAPTURE_RULES_VERSION = 1;

export const BUILT_IN_AUTO_CAPTURE_DENY = Object.freeze([
  Object.freeze({
    extension: "xpi",
    reason: "firefox-install-package",
  }),
]);

const BUILT_IN_DENY_EXTENSIONS = new Set(
  BUILT_IN_AUTO_CAPTURE_DENY.map(rule => rule.extension),
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AutoCaptureConfigError extends Error {
  constructor(code, args = {}) {
    super(code);
    this.name = "AutoCaptureConfigError";
    this.code = code;
    this.args = args;
  }
}

export function normalizeAutoExtensions(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Automatic download extensions must be an array");
  }

  const extensions = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const extension = entry
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "");
    if (
      !extension ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(extension) ||
      seen.has(extension)
    ) {
      continue;
    }
    seen.add(extension);
    extensions.push(extension);
  }
  return extensions.sort();
}

export function isBuiltInAutoCaptureDeny(value) {
  const extension = normalizeAutoExtensions([value])[0] || "";
  return Boolean(extension && BUILT_IN_DENY_EXTENSIONS.has(extension));
}

export function createEmptyAutoCaptureDocument() {
  return {
    version: AUTO_CAPTURE_RULES_VERSION,
    rules: [],
  };
}

export function normalizeAutoCaptureDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AutoCaptureConfigError("invalid-root");
  }
  if (value.version !== AUTO_CAPTURE_RULES_VERSION) {
    throw new AutoCaptureConfigError("unsupported-version", {
      version: value.version,
    });
  }
  if (!Array.isArray(value.rules)) {
    throw new AutoCaptureConfigError("invalid-rules");
  }

  const ids = new Set();
  const matches = new Set();
  const rules = value.rules.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AutoCaptureConfigError("invalid-rule", { index });
    }
    const id = String(entry.id || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(id) || ids.has(id)) {
      throw new AutoCaptureConfigError(
        ids.has(id) ? "duplicate-id" : "invalid-id",
        { index, id },
      );
    }
    ids.add(id);

    const action = String(entry.action || "").trim().toLowerCase();
    if (action !== "allow" && action !== "deny") {
      throw new AutoCaptureConfigError("invalid-action", { index, action });
    }
    const match = entry.match;
    if (!match || typeof match !== "object" || Array.isArray(match)) {
      throw new AutoCaptureConfigError("invalid-match", { index });
    }
    if (match.type !== "extension") {
      throw new AutoCaptureConfigError("unsupported-match-type", {
        index,
        type: match.type,
      });
    }
    const extension = normalizeAutoExtensions([match.value])[0] || "";
    if (!extension) {
      throw new AutoCaptureConfigError("invalid-extension", { index });
    }
    if (BUILT_IN_DENY_EXTENSIONS.has(extension)) {
      throw new AutoCaptureConfigError("built-in-extension", { extension });
    }
    const matchKey = `extension:${extension}`;
    if (matches.has(matchKey)) {
      throw new AutoCaptureConfigError("duplicate-match", { extension });
    }
    matches.add(matchKey);
    return {
      id,
      action,
      match: {
        type: "extension",
        value: extension,
      },
    };
  });

  return {
    version: AUTO_CAPTURE_RULES_VERSION,
    rules,
  };
}

export function stringifyAutoCaptureDocument(value) {
  return `${JSON.stringify(normalizeAutoCaptureDocument(value), null, 2)}\n`;
}

export function getAutoCaptureDisposition(document, value) {
  const extension = normalizeAutoExtensions([value])[0] || "";
  if (!extension) {
    return "default";
  }
  if (BUILT_IN_DENY_EXTENSIONS.has(extension)) {
    return "deny";
  }
  const normalized = normalizeAutoCaptureDocument(document);
  const rule = normalized.rules.find(entry =>
    entry.match.type === "extension" && entry.match.value === extension
  );
  return rule?.action || "default";
}

export function updateAutoCaptureRule(
  document,
  value,
  disposition,
  newRuleId = "",
) {
  if (!["allow", "deny", "default"].includes(disposition)) {
    throw new TypeError("Unsupported automatic capture disposition");
  }
  const extension = normalizeAutoExtensions([value])[0] || "";
  const normalized = normalizeAutoCaptureDocument(document);
  if (!extension || BUILT_IN_DENY_EXTENSIONS.has(extension)) {
    return normalized;
  }

  const existing = normalized.rules.find(entry =>
    entry.match.type === "extension" && entry.match.value === extension
  );
  const rules = normalized.rules.filter(entry => entry !== existing);
  if (disposition !== "default") {
    rules.push({
      id: existing?.id || newRuleId,
      action: disposition,
      match: {
        type: "extension",
        value: extension,
      },
    });
  }
  return normalizeAutoCaptureDocument({
    version: AUTO_CAPTURE_RULES_VERSION,
    rules,
  });
}

export function listAutoCaptureExtensions(document, action) {
  if (action !== "allow" && action !== "deny") {
    throw new TypeError("Unsupported automatic capture action");
  }
  return normalizeAutoCaptureDocument(document).rules
    .filter(rule => rule.action === action && rule.match.type === "extension")
    .map(rule => rule.match.value)
    .sort();
}
