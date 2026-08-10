import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

export interface ProductMetadata {
  version: string;
  firefoxMinVersion: string;
  downloadUrl: string;
  repositoryUrl: string;
  loaderUrl: string;
}

const repositoryUrl = "https://github.com/benzBrake/DownloadIt";
function findInstallManifest(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(directory, "addon", "install.rdf");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Could not locate addon/install.rdf from the website build");
}

const installManifestPath = findInstallManifest();

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Missing ${field} in addon/install.rdf`);
  }

  const normalized = String(value).trim();
  if (!normalized) {
    throw new Error(`Empty ${field} in addon/install.rdf`);
  }
  return normalized;
}

function readProductMetadata(): ProductMetadata {
  const manifestXml = readFileSync(installManifestPath, "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  const manifest = parser.parse(manifestXml) as {
    RDF?: {
      Description?: {
        version?: unknown;
        targetApplication?: { Description?: { minVersion?: unknown } };
      };
    };
  };
  const description = manifest.RDF?.Description;
  const version = requireString(description?.version, "version");
  const firefoxMinVersion = requireString(
    description?.targetApplication?.Description?.minVersion,
    "minimum Firefox version",
  );

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `DownloadIt version must use MAJOR.MINOR.PATCH format; received ${version}`,
    );
  }

  return Object.freeze({
    version,
    firefoxMinVersion,
    downloadUrl: `${repositoryUrl}/releases/download/nightly/addon.xpi`,
    repositoryUrl,
    loaderUrl: "https://github.com/benzBrake/userChrome.js-Loader",
  });
}

export const product = readProductMetadata();
