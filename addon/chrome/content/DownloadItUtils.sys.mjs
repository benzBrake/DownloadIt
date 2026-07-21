export function getManagerOutputEncoding(locale) {
  const normalizedLocale = String(locale || "").toLowerCase();
  if (normalizedLocale === "zh-cn") {
    return "gbk";
  }
  if (normalizedLocale === "zh-tw" || normalizedLocale === "zh-hk") {
    return "big5";
  }
  return "windows-1252";
}

export function getBaseDomain(uri, eTLDService) {
  const host = uri?.asciiHost || uri?.host || "";
  if (!host) {
    return "";
  }
  try {
    return eTLDService.getBaseDomainFromHost(host);
  } catch {
    return host;
  }
}

export function cookieMatchesURI(cookie, uri, now = Date.now()) {
  const requestHost = String(uri.asciiHost || uri.host || "").toLowerCase();
  const cookieHost = String(cookie.host || "").replace(/^\./, "").toLowerCase();
  const requestPath = uri.filePath || "/";
  const cookiePath = cookie.path || "/";

  if (!requestHost || !cookieHost || !cookie.name) {
    return false;
  }
  if (cookie.isDomain) {
    if (requestHost !== cookieHost && !requestHost.endsWith(`.${cookieHost}`)) {
      return false;
    }
  } else if (requestHost !== cookieHost) {
    return false;
  }
  if (requestPath !== cookiePath && !requestPath.startsWith(
    cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`
  )) {
    return false;
  }
  if (cookie.isSecure && !uri.schemeIs("https")) {
    return false;
  }
  return !(Number(cookie.expires) > 0 && Number(cookie.expires) * 1000 <= now);
}

export function getCookieHeader(uri, browser, {
  cookieService,
  eTLDService,
  now = Date.now(),
  onLookupError = console.warn,
} = {}) {
  if (!uri?.schemeIs("http") && !uri?.schemeIs("https")) {
    return "";
  }

  const baseDomain = getBaseDomain(uri, eTLDService);
  const originAttributes = {
    ...(browser?.contentPrincipal?.originAttributes || {}),
  };
  const plans = [originAttributes];
  if (originAttributes.partitionKey) {
    const unpartitioned = { ...originAttributes };
    delete unpartitioned.partitionKey;
    plans.push(unpartitioned);
  }

  const cookies = [];
  const seen = new Set();
  for (const attributes of plans) {
    let candidates = [];
    try {
      candidates = cookieService.getCookiesFromHost(baseDomain, attributes);
    } catch (error) {
      onLookupError("DownloadIt: cookie lookup failed", error);
    }
    for (const cookie of candidates) {
      const key = `${cookie.host}\u0001${cookie.path}\u0001${cookie.name}`;
      if (!seen.has(key) && cookieMatchesURI(cookie, uri, now)) {
        seen.add(key);
        cookies.push(`${cookie.name}=${cookie.value}`);
      }
    }
  }
  return cookies.join("; ");
}
