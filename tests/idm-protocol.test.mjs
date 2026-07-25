import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIDMLocalResponse,
  hasAddonRequestPrincipal,
  IDM_LOCAL_BODY_LIMIT,
  parseIDMLocalEndpoint,
  parseIDMLocalMessage,
} from "../addon/chrome/content/DownloadItIDMProtocol.sys.mjs";

const encoder = new TextEncoder();

function field(key, value) {
  const text = String(value);
  return `${key}=${encoder.encode(text).length}:${text}`;
}

function message({
  seq = 1,
  url = "https://download.example/file.zip",
  sourcePage = "https://example.com",
  filename = "file.zip",
  headers = "User-Agent: Test Agent\nReferer: https://example.com/page\nCookie: sid=abc\n",
  fileSize = 1234,
  fields = null,
} = {}) {
  const values = fields || [
    field(4, "zip"),
    field(6, url),
    field(7, sourcePage),
    field(11, headers),
    field(100, filename),
    field(122, 4),
  ];
  return `MSG#${seq}#13#1#10241:${seq + 1000}:0:1700000000000:0:1:2:${fileSize}:0,${values.join(",")};`;
}

test("IDM local endpoint matching is exact", () => {
  assert.deepEqual(parseIDMLocalEndpoint(
    "http://127.0.0.1:1001/client/1?seq=42",
    "POST",
  ), { clientId: 1, seq: 42 });

  for (const [url, method] of [
    ["http://localhost:1001/client/1?seq=42", "POST"],
    ["https://127.0.0.1:1001/client/1?seq=42", "POST"],
    ["http://127.0.0.1:1001/client/1?seq=42", "GET"],
    ["http://127.0.0.1:1001/client/1?seq=0", "POST"],
    ["http://127.0.0.1:1001/client/1?seq=42&extra=1", "POST"],
    ["http://127.0.0.1:1001/?cid=1", "POST"],
  ]) {
    assert.equal(parseIDMLocalEndpoint(url, method), null);
  }
});

test("IDM local message parser honors UTF-8 byte lengths", () => {
  const parsed = parseIDMLocalMessage(message({
    filename: "archive-中文.zip",
    url: "https://download.example/file.zip?name=a,b",
  }), 1);

  assert.deepEqual(parsed, {
    seq: 1,
    url: "https://download.example/file.zip?name=a,b",
    filename: "archive-中文.zip",
    fileSize: 1234,
    sourcePage: "https://example.com/",
    userAgent: "Test Agent",
    referer: "https://example.com/page",
    cookie: "sid=abc",
  });
});

test("IDM local message parser accepts upload streams with HTTP headers", () => {
  const body = message({ filename: "archive.zip" });
  const prefixed = [
    "Content-Type: text/plain; charset=UTF-8",
    `Content-Length: ${encoder.encode(body).length}`,
    "",
    body,
  ].join("\r\n");

  assert.equal(parseIDMLocalMessage(prefixed, 1).filename, "archive.zip");
  assert.throws(
    () => parseIDMLocalMessage(`invalid preamble\r\n\r\n${body}`, 1),
    /upload headers/i,
  );
});

test("IDM local message parser ignores unforwarded headers", () => {
  const parsed = parseIDMLocalMessage(message({
    headers: "Origin: https://example.com\nX-Private: value\nUser-Agent: Agent\n",
  }), 1);

  assert.equal(parsed.userAgent, "Agent");
  assert.equal(parsed.referer, "");
  assert.equal(parsed.cookie, "");
});

test("IDM local message parser rejects malformed or unsafe messages", () => {
  assert.throws(
    () => parseIDMLocalMessage(message({ seq: 2 }), 1),
    /metadata/i,
  );
  assert.throws(
    () => parseIDMLocalMessage(message({ url: "file:///tmp/file.zip" }), 1),
    /protocol/i,
  );
  assert.throws(
    () => parseIDMLocalMessage(message({
      fields: [field(6, "https://example.com/a"), field(6, "https://example.com/b")],
    }), 1),
    /duplicate/i,
  );
  assert.throws(
    () => parseIDMLocalMessage(message().replace("6=", "6=9999:"), 1),
    /field|UTF-8|truncated/i,
  );
  assert.throws(
    () => parseIDMLocalMessage(new Uint8Array(IDM_LOCAL_BODY_LIMIT + 1), 1),
    /size/i,
  );
});

test("only extension principals are accepted", () => {
  assert.equal(hasAddonRequestPrincipal({
    triggeringPrincipal: { isAddonOrExpandedAddonPrincipal: true },
  }), true);
  assert.equal(hasAddonRequestPrincipal({
    loadingPrincipal: { isAddonOrExpandedAddonPrincipal: true },
  }), true);
  assert.equal(hasAddonRequestPrincipal({
    triggeringPrincipal: { isAddonOrExpandedAddonPrincipal: false },
  }), false);
  assert.equal(hasAddonRequestPrincipal(null), false);
});

test("IDM local responses use the expected sequence status suffix", () => {
  assert.equal(buildIDMLocalResponse(7, true), "7:3;");
  assert.equal(buildIDMLocalResponse(7, false), "7:0;");
});
