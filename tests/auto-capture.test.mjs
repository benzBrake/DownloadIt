import test from "node:test";
import assert from "node:assert/strict";

import {
  AutoCaptureConfigError,
  BUILT_IN_AUTO_CAPTURE_DENY,
  createEmptyAutoCaptureDocument,
  getAutoCaptureDisposition,
  listAutoCaptureExtensions,
  normalizeAutoCaptureDocument,
  stringifyAutoCaptureDocument,
  updateAutoCaptureRule,
} from "../addon/chrome/content/DownloadItAutoCapture.sys.mjs";

const ZIP_RULE_ID = "11111111-1111-4111-8111-111111111111";
const EXE_RULE_ID = "22222222-2222-4222-8222-222222222222";

test("automatic capture documents normalize extension rules", () => {
  assert.deepEqual(normalizeAutoCaptureDocument({
    version: 1,
    rules: [
      {
        id: ZIP_RULE_ID.toUpperCase(),
        action: "ALLOW",
        match: { type: "extension", value: ".ZIP" },
      },
      {
        id: EXE_RULE_ID,
        action: "deny",
        match: { type: "extension", value: "exe" },
      },
    ],
  }), {
    version: 1,
    rules: [
      {
        id: ZIP_RULE_ID,
        action: "allow",
        match: { type: "extension", value: "zip" },
      },
      {
        id: EXE_RULE_ID,
        action: "deny",
        match: { type: "extension", value: "exe" },
      },
    ],
  });
});

test("rule matching distinguishes allow, deny, default, and built-in deny", () => {
  const document = normalizeAutoCaptureDocument({
    version: 1,
    rules: [
      {
        id: ZIP_RULE_ID,
        action: "allow",
        match: { type: "extension", value: "zip" },
      },
      {
        id: EXE_RULE_ID,
        action: "deny",
        match: { type: "extension", value: "exe" },
      },
    ],
  });

  assert.equal(getAutoCaptureDisposition(document, "zip"), "allow");
  assert.equal(getAutoCaptureDisposition(document, "exe"), "deny");
  assert.equal(getAutoCaptureDisposition(document, "pdf"), "default");
  assert.equal(getAutoCaptureDisposition(document, "xpi"), "deny");
  assert.deepEqual(listAutoCaptureExtensions(document, "allow"), ["zip"]);
  assert.deepEqual(listAutoCaptureExtensions(document, "deny"), ["exe"]);
});

test("updating a rule preserves its ID while changing or removing its action", () => {
  let document = updateAutoCaptureRule(
    createEmptyAutoCaptureDocument(),
    "zip",
    "allow",
    ZIP_RULE_ID,
  );
  assert.equal(document.rules[0].id, ZIP_RULE_ID);
  assert.equal(document.rules[0].action, "allow");

  document = updateAutoCaptureRule(document, "zip", "deny", EXE_RULE_ID);
  assert.equal(document.rules[0].id, ZIP_RULE_ID);
  assert.equal(document.rules[0].action, "deny");

  document = updateAutoCaptureRule(document, "zip", "default");
  assert.deepEqual(document, createEmptyAutoCaptureDocument());
});

test("invalid, duplicate, and built-in rules are rejected", () => {
  const invalidDocuments = [
    { version: 2, rules: [] },
    { version: 1, rules: [{ id: "bad", action: "allow", match: {} }] },
    {
      version: 1,
      rules: [
        {
          id: ZIP_RULE_ID,
          action: "allow",
          match: { type: "extension", value: "zip" },
        },
        {
          id: EXE_RULE_ID,
          action: "deny",
          match: { type: "extension", value: "zip" },
        },
      ],
    },
    {
      version: 1,
      rules: [{
        id: ZIP_RULE_ID,
        action: "allow",
        match: { type: "extension", value: "xpi" },
      }],
    },
  ];
  for (const document of invalidDocuments) {
    assert.throws(
      () => normalizeAutoCaptureDocument(document),
      error => error instanceof AutoCaptureConfigError,
    );
  }
});

test("the XPI built-in deny rule is immutable and not serialized", () => {
  assert.deepEqual(BUILT_IN_AUTO_CAPTURE_DENY, [{
    extension: "xpi",
    reason: "firefox-install-package",
  }]);
  const document = createEmptyAutoCaptureDocument();
  assert.deepEqual(
    updateAutoCaptureRule(document, "xpi", "allow", ZIP_RULE_ID),
    document,
  );
  assert.doesNotMatch(stringifyAutoCaptureDocument(document), /xpi/);
  assert.match(stringifyAutoCaptureDocument(document), /"rules": \[\]/);
});
