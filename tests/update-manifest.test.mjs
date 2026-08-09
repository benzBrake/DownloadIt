import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installManifestPath = path.join(projectRoot, "addon", "install.rdf");
const generatorPath = path.join(projectRoot, "scripts", "New-UpdateManifest.ps1");
const nightlyXpiUrl = "https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi";
const nightlyUpdateManifestUrl = "https://github.com/benzBrake/DownloadIt/releases/download/nightly/update.rdf";

function manifestValue(source, name) {
  const match = source.match(new RegExp(`<em:${name}>([^<]+)</em:${name}>`));
  assert.ok(match, `install.rdf should define em:${name}`);
  return match[1];
}

test("update manifest mirrors DownloadIt install metadata", t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "downloadit-update-manifest-"),
  );
  const outputPath = path.join(temporaryDirectory, "update.rdf");
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

  execFileSync(
    process.platform === "win32" ? "pwsh.exe" : "pwsh",
    [
      "-NoProfile",
      "-File",
      generatorPath,
      "-InstallManifestPath",
      installManifestPath,
      "-OutputPath",
      outputPath,
    ],
    { cwd: projectRoot, stdio: "pipe" },
  );

  const installManifest = fs.readFileSync(installManifestPath, "utf8");
  const updateManifest = fs.readFileSync(outputPath, "utf8");
  const extensionId = manifestValue(installManifest, "id");
  const version = manifestValue(installManifest, "version");
  const targetApplication = installManifest.match(
    /<em:targetApplication>\s*<Description>([\s\S]*?)<\/Description>\s*<\/em:targetApplication>/,
  );
  assert.ok(targetApplication, "install.rdf should define a target application");
  const targetApplicationSource = targetApplication[1];
  const targetApplicationId = manifestValue(targetApplicationSource, "id");
  const minVersion = manifestValue(targetApplicationSource, "minVersion");
  const maxVersion = manifestValue(targetApplicationSource, "maxVersion");

  assert.ok(installManifest.includes(`<em:updateURL>${nightlyUpdateManifestUrl}</em:updateURL>`));
  assert.ok(updateManifest.includes(`about="urn:mozilla:extension:${extensionId}"`));
  assert.ok(updateManifest.includes(`<em:version>${version}</em:version>`));
  assert.ok(updateManifest.includes(`<em:id>${targetApplicationId}</em:id>`));
  assert.ok(updateManifest.includes(`<em:minVersion>${minVersion}</em:minVersion>`));
  assert.ok(updateManifest.includes(`<em:maxVersion>${maxVersion}</em:maxVersion>`));
  assert.ok(updateManifest.includes(`<em:updateLink>${nightlyXpiUrl}</em:updateLink>`));
});
