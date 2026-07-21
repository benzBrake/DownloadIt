import test from "node:test";
import assert from "node:assert/strict";

import {
  cookieMatchesURI,
  getBaseDomain,
  getCookieHeader,
  getManagerOutputEncoding,
} from "../addon/chrome/content/DownloadItUtils.sys.mjs";

function mockURI(spec) {
  const url = new URL(spec);
  return {
    asciiHost: url.hostname,
    host: url.hostname,
    filePath: url.pathname,
    schemeIs(scheme) {
      return url.protocol === `${scheme}:`;
    },
  };
}

function mockCookie(overrides = {}) {
  return {
    host: "sub.example.com",
    path: "/",
    name: "session",
    value: "abc",
    isDomain: false,
    isSecure: false,
    expires: 0,
    ...overrides,
  };
}

test("manager output encoding follows the Firefox locale", () => {
  assert.equal(getManagerOutputEncoding("zh-CN"), "gbk");
  assert.equal(getManagerOutputEncoding("zh-TW"), "big5");
  assert.equal(getManagerOutputEncoding("zh-HK"), "big5");
  assert.equal(getManagerOutputEncoding("en-US"), "windows-1252");
});

test("base-domain lookup falls back to the URI host", () => {
  const uri = mockURI("https://download.example.com/file.zip");
  const eTLDService = {
    getBaseDomainFromHost(host) {
      assert.equal(host, "download.example.com");
      return "example.com";
    },
  };

  assert.equal(getBaseDomain(uri, eTLDService), "example.com");
  assert.equal(getBaseDomain(uri, {
    getBaseDomainFromHost() {
      throw new Error("not a registrable domain");
    },
  }), "download.example.com");
  assert.equal(getBaseDomain({ asciiHost: "" }, eTLDService), "");
});

test("cookie matching enforces domain, path, security, and expiry rules", () => {
  const now = 1_700_000_000_000;
  const httpsURI = mockURI("https://files.example.com/download/file.zip");
  const httpURI = mockURI("http://files.example.com/download/file.zip");

  assert.equal(cookieMatchesURI(mockCookie({
    host: ".example.com",
    path: "/download",
    isDomain: true,
    isSecure: true,
  }), httpsURI, now), true);
  assert.equal(cookieMatchesURI(mockCookie({
    host: ".example.com",
    path: "/download",
    isDomain: true,
  }), mockURI("https://files.example.com/downloads/file.zip"), now), false);
  assert.equal(cookieMatchesURI(mockCookie({
    host: "example.com",
    isDomain: false,
  }), httpsURI, now), false);
  assert.equal(cookieMatchesURI(mockCookie({
    isSecure: true,
  }), httpURI, now), false);
  assert.equal(cookieMatchesURI(mockCookie({
    expires: (now / 1000) - 1,
  }), httpsURI, now), false);
});

test("cookie header combines partition plans and removes duplicates", () => {
  const uri = mockURI("https://files.example.com/download/file.zip");
  const calls = [];
  const partitionedCookie = mockCookie({
    host: ".example.com",
    name: "partitioned",
    value: "yes",
    isDomain: true,
  });
  const fallbackCookie = mockCookie({
    host: "files.example.com",
    name: "fallback",
    value: "yes",
  });
  const cookieService = {
    getCookiesFromHost(baseDomain, originAttributes) {
      calls.push({ baseDomain, originAttributes });
      return originAttributes.partitionKey
        ? [partitionedCookie]
        : [partitionedCookie, fallbackCookie];
    },
  };

  assert.equal(getCookieHeader(uri, {
    contentPrincipal: {
      originAttributes: {
        userContextId: 2,
        partitionKey: "https://example.com^partition-key",
      },
    },
  }, {
    cookieService,
    eTLDService: {
      getBaseDomainFromHost: () => "example.com",
    },
    now: 1_700_000_000_000,
  }), "partitioned=yes; fallback=yes");

  assert.deepEqual(calls, [
    {
      baseDomain: "example.com",
      originAttributes: {
        userContextId: 2,
        partitionKey: "https://example.com^partition-key",
      },
    },
    {
      baseDomain: "example.com",
      originAttributes: {
        userContextId: 2,
      },
    },
  ]);
});

test("cookie lookup errors are reported and do not stop fallback lookup", () => {
  const uri = mockURI("https://example.com/file.zip");
  const warnings = [];
  let lookupCount = 0;
  const header = getCookieHeader(uri, {
    contentPrincipal: {
      originAttributes: {
        partitionKey: "https://example.com^partition-key",
      },
    },
  }, {
    cookieService: {
      getCookiesFromHost() {
        lookupCount += 1;
        if (lookupCount === 1) {
          throw new Error("partition unavailable");
        }
        return [mockCookie({
          host: "example.com",
          name: "fallback",
        })];
      },
    },
    eTLDService: {
      getBaseDomainFromHost: () => "example.com",
    },
    onLookupError: (...args) => warnings.push(args),
  });

  assert.equal(header, "fallback=abc");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /cookie lookup failed/);
});

test("non-http URLs do not query the cookie service", () => {
  let queried = false;
  assert.equal(getCookieHeader(mockURI("ftp://example.com/file.zip"), null, {
    cookieService: {
      getCookiesFromHost() {
        queried = true;
        return [];
      },
    },
    eTLDService: {},
  }), "");
  assert.equal(queried, false);
});
