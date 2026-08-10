import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = fileURLToPath(new URL("..", import.meta.url));
const docsRoot = join(websiteRoot, "src", "content", "docs");
const chineseRoot = join(docsRoot, "zh-CN");
const supportedExtensions = new Set([".md", ".mdx"]);

async function collectDocs(root) {
  const docs = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      docs.push(...(await collectDocs(path)));
    } else if (supportedExtensions.has(extname(entry.name))) {
      docs.push(path);
    }
  }
  return docs;
}

function relativeDocs(files, root) {
  return files.map((path) => relative(root, path).split(sep).join("/")).sort();
}

async function assertFrontmatter(path) {
  const source = await readFile(path, "utf8");
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Missing frontmatter: ${relative(websiteRoot, path)}`);

  for (const field of ["title", "description"]) {
    if (!new RegExp(`^${field}:\\s*\\S`, "m").test(match[1])) {
      throw new Error(`Missing ${field}: ${relative(websiteRoot, path)}`);
    }
  }
}

const englishFiles = (await collectDocs(docsRoot)).filter(
  (path) => !path.startsWith(`${chineseRoot}${sep}`),
);
const chineseFiles = await collectDocs(chineseRoot);
const englishDocs = relativeDocs(englishFiles, docsRoot);
const chineseDocs = relativeDocs(chineseFiles, chineseRoot);

if (chineseDocs.some((doc) => doc.includes("\\") || doc.includes("zh-CN"))) {
  throw new Error("Chinese document slugs must be relative to src/content/docs/zh-CN");
}

if (JSON.stringify(englishDocs) !== JSON.stringify(chineseDocs)) {
  const missingChinese = englishDocs.filter((doc) => !chineseDocs.includes(doc));
  const missingEnglish = chineseDocs.filter((doc) => !englishDocs.includes(doc));
  throw new Error(
    [
      missingChinese.length ? `Missing zh-CN docs: ${missingChinese.join(", ")}` : "",
      missingEnglish.length ? `Missing English docs: ${missingEnglish.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

await Promise.all([...englishFiles, ...chineseFiles].map(assertFrontmatter));
console.log(`Verified ${englishDocs.length} bilingual document pairs.`);
