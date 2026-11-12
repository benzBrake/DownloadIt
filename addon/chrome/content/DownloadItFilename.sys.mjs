const ENCODINGS = Object.freeze(["GB18030", "Big5", "Shift_JIS"]);

function decodePercentBytes(value, encoding) {
  try {
    const decoder = new TextDecoder(encoding, { fatal: true });
    let output = "";
    for (let index = 0; index < value.length;) {
      if (value[index] === "%" && /^[\da-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
        const bytes = [];
        while (value[index] === "%" && /^[\da-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
          bytes.push(parseInt(value.slice(index + 1, index + 3), 16));
          index += 3;
        }
        output += decoder.decode(new Uint8Array(bytes));
        continue;
      }
      const codePoint = value.codePointAt(index);
      output += String.fromCodePoint(codePoint);
      index += codePoint > 0xffff ? 2 : 1;
    }
    return output;
  } catch {
    return "";
  }
}

function scoreCandidate(value, locale) {
  if (!value || /[\uFFFD\u0000-\u001F]/u.test(value)) {
    return -Infinity;
  }
  const cjk = (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) || []).length;
  const suspicious = (value.match(/[ÃÂÐÑØÞðþ]|鈥|锟|縺|繧/gu) || []).length;
  const localeHint = /^ja/i.test(locale) && /[\u3040-\u30ff]/u.test(value) ||
    /^zh-(?:cn|sg)/i.test(locale) && /[\u4e00-\u9fff]/u.test(value) ||
    /^zh-(?:tw|hk)/i.test(locale) && /[\u4e00-\u9fff]/u.test(value);
  return cjk * 2 - suspicious * 4 + (localeHint ? 1 : 0);
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

export function getFilenameEncodingCandidates(rawFilename, locale = "") {
  const raw = String(rawFilename || "");
  let utf8 = "";
  try {
    utf8 = decodePercentBytes(raw, "utf-8");
  } catch {}
  if (utf8 && !/[\uFFFD\u0000-\u001F]/u.test(utf8)) {
    return { original: utf8, detected: utf8, encoding: "UTF-8", candidates: [] };
  }

  const candidates = ENCODINGS.map(encoding => ({
    encoding,
    value: decodePercentBytes(raw, encoding),
  })).filter(candidate => candidate.value);
  candidates.sort((left, right) =>
    scoreCandidate(right.value, locale) - scoreCandidate(left.value, locale),
  );
  const detected = candidates[0] && scoreCandidate(candidates[0].value, locale) > 0
    ? candidates[0]
    : null;
  return {
    original: decodePercentBytes(raw, "utf-8") || raw,
    detected: detected?.value || decodePercentBytes(raw, "utf-8") || raw,
    encoding: detected?.encoding || "",
    candidates,
  };
}

export const FILENAME_ENCODINGS = ENCODINGS;
