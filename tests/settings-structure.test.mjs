import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(
  path.join(projectRoot, relativePath),
  "utf8",
);

test("manifest exposes the Firefox settings dialog", () => {
  const manifest = read("addon/install.rdf");
  assert.match(manifest, /<em:optionsURL>chrome:\/\/downloadit\/content\/options\.xhtml<\/em:optionsURL>/);
  assert.match(manifest, /<em:optionsType>1<\/em:optionsType>/);
});

test("settings dialog contains the current capability controls", () => {
  const markup = read("addon/chrome/content/options.xhtml");
  assert.doesNotMatch(markup, /chrome:\/\/global\/skin\/menulist\.css/);
  assert.match(markup, /xmlns:xul="http:\/\/www\.mozilla\.org\/keymaster\/gatekeeper\/there\.is\.only\.xul"/);
  assert.match(markup, /<xul:menulist id="default-manager"/);
  assert.match(markup, /<xul:menupopup id="default-manager-popup"/);
  assert.match(markup, /<link rel="localization" href="downloadit\.ftl"/);
  assert.match(markup, /<script[^>]+src="chrome:\/\/downloadit\/content\/options\.js"/);
  for (const id of [
    "section-managers",
    "default-manager",
    "refresh-managers",
    "section-privacy",
    "send-cookies",
    "section-about",
    "apply",
    "cancel",
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
});

test("settings refresh keeps default-manager persistence staged", () => {
  const script = read("addon/chrome/content/options.js");
  assert.match(script, /DownloadItXUL\.sys\.mjs/);
  assert.doesNotMatch(script, /XUL_NS|createElementNS/);
  assert.match(script, /createXULElement\(document, "menuitem"\)/);
  assert.match(script, /addEventListener\("command"/);
  assert.match(script, /renderedManagerNames/);
  assert.match(script, /refreshManagers\(\{ persistDefault: false \}\)/);
  assert.match(script, /state\.service\.applySettings\(state\.draft\)/);
});
