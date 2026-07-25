export const IDM_LOCAL_BODY_LIMIT = 256 * 1024;

const MAX_SEQUENCE = 0x7fffffff;
const MAX_FILENAME_LENGTH = 4096;
const MAX_URL_LENGTH = 16384;
const UPLOAD_HEADER_LIMIT = 16 * 1024;
const ALLOWED_HEADERS = new Map([
  ["cookie", "cookie"],
  ["referer", "referer"],
  ["user-agent", "userAgent"],
]);

function decodeUTF8(bytes) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseDecimal(bytes, start, end, label) {
  if (start >= end) {
    throw new TypeError(`Missing IDM ${label}`);
  }
  for (let index = start; index < end; index++) {
    if (bytes[index] < 0x30 || bytes[index] > 0x39) {
      throw new TypeError(`Invalid IDM ${label}`);
    }
  }
  const value = Number(decodeUTF8(bytes.subarray(start, end)));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid IDM ${label}`);
  }
  return value;
}

function findByte(bytes, value, start) {
  for (let index = start; index < bytes.length; index++) {
    if (bytes[index] === value) {
      return index;
    }
  }
  return -1;
}

function startsWithIDMMessage(bytes) {
  return bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x53 &&
    bytes[2] === 0x47 &&
    bytes[3] === 0x23;
}

function stripOptionalUploadHeaders(bytes) {
  if (startsWithIDMMessage(bytes)) {
    return bytes;
  }

  // nsIUploadChannel may retain MIME headers when streamHasHeaders was used.
  let headerEnd = -1;
  const scanEnd = Math.min(bytes.length, UPLOAD_HEADER_LIMIT + 4);
  for (let index = 1; index < scanEnd; index++) {
    if (bytes[index - 1] === 0x0a && bytes[index] === 0x0a) {
      headerEnd = index + 1;
      break;
    }
    if (
      index >= 3 &&
      bytes[index - 3] === 0x0d &&
      bytes[index - 2] === 0x0a &&
      bytes[index - 1] === 0x0d &&
      bytes[index] === 0x0a
    ) {
      headerEnd = index + 1;
      break;
    }
  }
  if (headerEnd < 0 || headerEnd > UPLOAD_HEADER_LIMIT) {
    throw new TypeError("Malformed IDM upload headers");
  }

  const headerText = decodeUTF8(bytes.subarray(0, headerEnd));
  const terminatorLength = headerText.endsWith("\r\n\r\n") ? 4 : 2;
  const lines = headerText.slice(0, -terminatorLength).split(/\r?\n/);
  if (
    !lines.length ||
    lines.some(line =>
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+:[\t\x20-\x7e]*$/.test(line)
    )
  ) {
    throw new TypeError("Malformed IDM upload headers");
  }

  const body = bytes.subarray(headerEnd);
  if (!startsWithIDMMessage(body)) {
    throw new TypeError("Missing IDM message after upload headers");
  }
  return body;
}

function parseFields(bytes, start) {
  const fields = new Map();
  let cursor = start;
  while (cursor < bytes.length) {
    if (bytes[cursor] === 0x3b) {
      if (cursor !== bytes.length - 1) {
        throw new TypeError("Unexpected data after IDM field terminator");
      }
      return fields;
    }

    const equals = findByte(bytes, 0x3d, cursor);
    const colon = equals < 0 ? -1 : findByte(bytes, 0x3a, equals + 1);
    if (equals < 0 || colon < 0) {
      throw new TypeError("Malformed IDM field header");
    }
    const key = parseDecimal(bytes, cursor, equals, "field key");
    const byteLength = parseDecimal(bytes, equals + 1, colon, "field length");
    const valueStart = colon + 1;
    const valueEnd = valueStart + byteLength;
    if (valueEnd > bytes.length) {
      throw new TypeError("Truncated IDM field value");
    }
    if (fields.has(key)) {
      throw new TypeError(`Duplicate IDM field: ${key}`);
    }
    fields.set(key, decodeUTF8(bytes.subarray(valueStart, valueEnd)));
    cursor = valueEnd;

    const separator = bytes[cursor];
    if (separator === 0x2c) {
      cursor++;
      continue;
    }
    if (separator === 0x3b && cursor === bytes.length - 1) {
      return fields;
    }
    throw new TypeError("Malformed IDM field separator");
  }
  throw new TypeError("Missing IDM field terminator");
}

function parseHeaders(value) {
  if (value.length > 64 * 1024 || value.includes("\0")) {
    throw new TypeError("Invalid IDM request headers");
  }
  const headers = {
    cookie: "",
    referer: "",
    userAgent: "",
  };
  for (const rawLine of value.split(/\r?\n/)) {
    if (!rawLine) {
      continue;
    }
    const separator = rawLine.indexOf(":");
    if (separator <= 0) {
      throw new TypeError("Malformed IDM request header");
    }
    const name = rawLine.slice(0, separator).trim().toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) {
      throw new TypeError("Invalid IDM request header name");
    }
    const target = ALLOWED_HEADERS.get(name);
    if (target) {
      headers[target] = rawLine.slice(separator + 1).trim();
    }
  }
  return headers;
}

function normalizeWebURL(value, label, { required = false } = {}) {
  const text = String(value || "").trim();
  if (!text) {
    if (required) {
      throw new TypeError(`Missing IDM ${label}`);
    }
    return "";
  }
  if (text.length > MAX_URL_LENGTH) {
    throw new TypeError(`IDM ${label} is too long`);
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError(`Invalid IDM ${label}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Unsupported IDM ${label} protocol`);
  }
  return url.href;
}

export function parseIDMLocalEndpoint(spec, method) {
  if (String(method || "").toUpperCase() !== "POST") {
    return null;
  }
  let url;
  try {
    url = new URL(spec);
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "1001" ||
    url.username ||
    url.password ||
    url.hash
  ) {
    return null;
  }
  const pathMatch = /^\/client\/(\d{1,10})$/.exec(url.pathname);
  const sequenceValues = url.searchParams.getAll("seq");
  if (
    !pathMatch ||
    [...url.searchParams.keys()].length !== 1 ||
    sequenceValues.length !== 1 ||
    !/^\d{1,10}$/.test(sequenceValues[0])
  ) {
    return null;
  }
  const clientId = Number(pathMatch[1]);
  const seq = Number(sequenceValues[0]);
  if (clientId > MAX_SEQUENCE || seq < 1 || seq > MAX_SEQUENCE) {
    return null;
  }
  return { clientId, seq };
}

export function hasAddonRequestPrincipal(loadInfo) {
  for (const principal of [
    loadInfo?.triggeringPrincipal,
    loadInfo?.loadingPrincipal,
  ]) {
    try {
      if (principal?.isAddonOrExpandedAddonPrincipal) {
        return true;
      }
    } catch {}
  }
  return false;
}

export function parseIDMLocalMessage(input, expectedSeq) {
  const uploadBytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  if (!(uploadBytes instanceof Uint8Array)) {
    throw new TypeError("IDM request body must be bytes");
  }
  if (
    !uploadBytes.length ||
    uploadBytes.length > IDM_LOCAL_BODY_LIMIT
  ) {
    throw new TypeError("IDM request body has an invalid size");
  }
  const bytes = stripOptionalUploadHeaders(uploadBytes);

  const comma = findByte(bytes, 0x2c, 0);
  if (comma < 0) {
    throw new TypeError("Missing IDM message fields");
  }
  const metadata = decodeUTF8(bytes.subarray(0, comma));
  const metadataMatch = /^MSG#(\d+)#13#1#10241:(\d+):0:(\d+):0:1:2:(\d+):0$/.exec(
    metadata,
  );
  if (!metadataMatch) {
    throw new TypeError("Malformed IDM message metadata");
  }
  const seq = Number(metadataMatch[1]);
  const sequenceMarker = Number(metadataMatch[2]);
  const timestamp = Number(metadataMatch[3]);
  const fileSize = Number(metadataMatch[4]);
  if (
    !Number.isSafeInteger(seq) ||
    seq !== expectedSeq ||
    seq < 1 ||
    seq > MAX_SEQUENCE ||
    sequenceMarker !== seq + 1000 ||
    !Number.isSafeInteger(timestamp) ||
    !Number.isSafeInteger(fileSize)
  ) {
    throw new TypeError("Inconsistent IDM message metadata");
  }

  const fields = parseFields(bytes, comma + 1);
  const url = normalizeWebURL(fields.get(6), "download URL", { required: true });
  const sourcePage = normalizeWebURL(fields.get(7), "source page");
  const filename = String(fields.get(100) || "");
  if (filename.length > MAX_FILENAME_LENGTH || filename.includes("\0")) {
    throw new TypeError("Invalid IDM filename");
  }
  const headers = parseHeaders(String(fields.get(11) || ""));
  const referer = normalizeWebURL(headers.referer, "Referer");

  return {
    seq,
    url,
    filename,
    fileSize,
    sourcePage,
    userAgent: headers.userAgent,
    referer,
    cookie: headers.cookie,
  };
}

export function buildIDMLocalResponse(seq, succeeded) {
  return `${seq}:${succeeded ? 3 : 0};`;
}
