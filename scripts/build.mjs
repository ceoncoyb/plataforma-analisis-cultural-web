import { cp, mkdir, rm, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = resolve(root, "public");
const output = resolve(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
const asset = "assets/site.js";
const code = await readFile(resolve(source, asset));
const fingerprint = createHash("sha256").update(code).digest("hex").slice(0, 12);
const versionedAsset = `assets/site.${fingerprint}.js`;
await cp(resolve(source, asset), resolve(output, versionedAsset));
await unlink(resolve(output, asset));

const stylesheet = "assets/site.css";
const css = await readFile(resolve(source, stylesheet));
const cssFingerprint = createHash("sha256").update(css).digest("hex").slice(0, 12);
const versionedStylesheet = `assets/site.${cssFingerprint}.css`;
await cp(resolve(source, stylesheet), resolve(output, versionedStylesheet));
await unlink(resolve(output, stylesheet));

async function rewriteHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await rewriteHtml(path);
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = await readFile(path, "utf8");
      const versionedHtml = html
        .replaceAll(`/${asset}`, `/${versionedAsset}`)
        .replaceAll(`/${stylesheet}`, `/${versionedStylesheet}`);
      await writeFile(path, versionedHtml);
    }
  }
}
await rewriteHtml(output);
console.log("Static site built in dist/.");

