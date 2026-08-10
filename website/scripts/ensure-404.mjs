import { copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const source = resolve(outputDirectory, "404", "index.html");
const target = resolve(outputDirectory, "404.html");

try {
  await access(source, constants.F_OK);
  await copyFile(source, target);
} catch (error) {
  console.error(`Unable to create ${target}: ${error.message}`);
  process.exitCode = 1;
}
