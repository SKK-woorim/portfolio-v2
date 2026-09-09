import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fontDirectory = path.resolve(scriptDirectory, "../public/assets/fonts/pretendard");
const cssPath = path.join(fontDirectory, "pretendardvariable-dynamic-subset.css");
const licensePath = path.join(fontDirectory, "LICENSE");
const expectedFontCount = 92;

async function fail(message) {
  throw new Error(`Pretendard asset check failed: ${message}`);
}

const [css, license, entries] = await Promise.all([
  readFile(cssPath, "utf8"),
  readFile(licensePath, "utf8"),
  readdir(fontDirectory, { withFileTypes: true }),
]);

if (!license.includes("SIL OPEN FONT LICENSE Version 1.1")) await fail("LICENSE is missing the SIL Open Font License text.");

const references = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
if (references.length !== expectedFontCount) await fail(`expected ${expectedFontCount} CSS font references, found ${references.length}.`);
if (references.some((reference) => !reference.startsWith("./") || !reference.endsWith(".woff2"))) await fail("CSS must use only local relative WOFF2 URLs.");

const referencedFiles = new Set(references.map((reference) => reference.slice(2)));
if (referencedFiles.size !== expectedFontCount) await fail("CSS contains duplicate or missing subset references.");

const fontFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".woff2")).map((entry) => entry.name);
if (fontFiles.length !== expectedFontCount) await fail(`expected ${expectedFontCount} WOFF2 files, found ${fontFiles.length}.`);
if (fontFiles.some((file) => !referencedFiles.has(file)) || [...referencedFiles].some((file) => !fontFiles.includes(file))) await fail("CSS references and local WOFF2 files do not match.");

await Promise.all(fontFiles.map(async (file) => {
  const header = await readFile(path.join(fontDirectory, file), { encoding: null }).then((buffer) => buffer.subarray(0, 4).toString("ascii"));
  if (header !== "wOF2") await fail(`${file} does not have a WOFF2 header.`);
}));

console.log(`Pretendard v1.3.9 assets verified: ${fontFiles.length} local WOFF2 files referenced by the dynamic-subset stylesheet.`);
