import { detectAll } from "./vendor/jschardet-4.1.0.sys.mjs";

const ENCODINGS = Object.freeze(["GB18030", "Big5", "Shift_JIS", "EUC-JP", "EUC-KR", "windows-1252"]);

function getPercentBytes(value) {
  const bytes = [];
  for (let index = 0; index < value.length;) {
    if (value[index] === "%" && /^[\da-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(parseInt(value.slice(index + 1, index + 3), 16)); index += 3;
    } else {
      const codePoint = value.codePointAt(index);
      for (const byte of new TextEncoder().encode(String.fromCodePoint(codePoint))) bytes.push(byte);
      index += codePoint > 0xffff ? 2 : 1;
    }
  }
  return new Uint8Array(bytes);
}

export function normalizeFilenameEncodings(value = []) {
  if (!Array.isArray(value) || value.length > 30) throw new RangeError("Invalid filename encodings");
  const result = [];
  for (const label of value) {
    if (typeof label !== "string" || label.length > 80) throw new RangeError("Invalid encoding label");
    const encoding = new TextDecoder(label.trim()).encoding;
    if (!result.includes(encoding)) result.push(encoding);
  }
  return result;
}

export function decodeURLFilename(raw, encoding) {
  try {
    const value = new TextDecoder(encoding, { fatal: true }).decode(getPercentBytes(String(raw || "")));
    return value && !/[\uFFFD\u0000-\u001F]/u.test(value) ? value : "";
  } catch { return ""; }
}

export function getURLFilenameCandidate(url) {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.slice(pathname.lastIndexOf("/") + 1);
    return segment || "";
  } catch {
    return "";
  }
}

export function getFilenameEncodingCandidates(rawFilename, locale = "", configuredEncodings = []) {
  const raw = String(rawFilename || "");
  const bytes = getPercentBytes(raw);
  const utf8 = decodeURLFilename(raw, "utf-8");
  if (utf8 && !/[\uFFFD\u0000-\u001F]/u.test(utf8)) {
    return { original: utf8, detected: utf8, encoding: "UTF-8", candidates: [], bytes };
  }

  const detectedEncodings = detectAll(bytes)
    .filter(item => item?.confidence > 0 && !/^UTF-(?:16|32)/i.test(item.encoding))
    .map(item => item.encoding === "CP932" ? "Shift_JIS" : item.encoding)
    .filter(Boolean);
  const encodings = [...new Set([...detectedEncodings, ...ENCODINGS, ...configuredEncodings.map(String)])];
  const candidates = encodings.map(encoding => ({
    encoding,
    value: decodeURLFilename(raw, encoding),
  })).filter(candidate => candidate.value);
  // Statistical scores are weak for very short names. Reject mappings that
  // manufacture private-use characters before choosing a guess.
  const guesses = candidates.filter(candidate => detectedEncodings.includes(candidate.encoding) &&
    !/[\uE000-\uF8FF]/u.test(candidate.value));
  const detected = guesses[0] || null;
  return {
    original: utf8 || raw,
    detected: detected?.value || utf8 || raw,
    encoding: detected?.encoding || "",
    candidates,
    bytes,
  };
}

export const FILENAME_ENCODINGS = ENCODINGS;
