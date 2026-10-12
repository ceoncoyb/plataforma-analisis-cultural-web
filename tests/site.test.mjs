import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(join(root, "public", path), "utf8");

test("product site explains the cross-disciplinary product and its actual limits", async () => {
  const home = await read("index.html");
  assert.match(home, /Cada proyecto configura su propio marco/);
  assert.match(home, /transversal, transdisciplinaria y multiuso/);
  assert.match(home, /Investigación de experiencia \(UX\)/);
  assert.match(home, /Estudios culturales y de medios/);
  assert.match(home, /Estudio audiovisual/);
  assert.match(home, /integración actual de ChatGPT está en piloto privado/);
  assert.match(home, /laboratorio audiovisual/);
});

test("sandbox keeps user material in-browser and exports a project brief", async () => {
  const demo = await read("demo/index.html");
  const script = await read("assets/site.js");
  assert.match(demo, /sandbox-form/);
  assert.match(demo, /Descargar JSON/);
  assert.match(script, /localStorage/);
  assert.match(script, /application\/json/);
  assert.match(script, /No genera interpretaciones/);
  assert.match(script, /URL\.createObjectURL/);
});

test("all product routes expose SEO metadata, navigation and privacy", async () => {
  const routes = ["index.html", "demo/index.html", "plans/index.html", "privacy/index.html"];
  for (const route of routes) {
    const html = await read(route);
    assert.match(html, /<title>/, route);
    assert.match(html, /name="description"/, route);
    assert.match(html, /name="viewport"/, route);
    assert.match(html, /rel="canonical"/, route);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, route);
    if (route !== "privacy/index.html") assert.match(html, /href="\/privacy\/"/, route);
  }
});

test("public pages contain no third-party trackers or invented app install links", async () => {
  const files = await readdir(join(root, "public"), { recursive: true });
  const htmlFiles = files.filter((file) => String(file).endsWith(".html"));
  for (const file of htmlFiles) {
    const html = await read(String(file));
    assert.doesNotMatch(html, /googletagmanager|google-analytics|segment\.com|hotjar/);
    assert.doesNotMatch(html, /chatgpt\.com\/apps\/[^"\s<]+/);
  }
});
