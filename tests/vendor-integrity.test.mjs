import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const detectorPath = "addon/chrome/content/vendor/jschardet-4.1.0.sys.mjs";

for (const autocrlf of ["true", "false"]) {
  test(`jschardet integrity survives Git checkout with core.autocrlf=${autocrlf}`, () => {
    const bytes = execFileSync("git", [
      "-c", `core.autocrlf=${autocrlf}`, "cat-file", "--filters", `HEAD:${detectorPath}`,
    ], { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
    const hash = createHash("sha256").update(bytes).digest("hex");
    for (const script of ["scripts/pack.ps1", "scripts/pack.sh"]) {
      const source = fs.readFileSync(new URL(`../${script}`, import.meta.url), "utf8");
      assert.ok(source.includes(`"${hash}"`), `${script} must accept the checked-out detector hash`);
    }
  });
}
