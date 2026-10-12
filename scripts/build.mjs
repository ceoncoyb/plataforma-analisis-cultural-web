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

async function rewriteHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await rewriteHtml(path);
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = await readFile(path, "utf8");
      await writeFile(path, html.replaceAll(`/${asset}`, `/${versionedAsset}`));
    }
  }
}
await rewriteHtml(output);
console.log("Static site built in dist/.");
