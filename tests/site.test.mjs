import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(join(root, "public", path), "utf8");

test("product site explains the cross-disciplinary product and its actual limits", async () => {
  const home = await read("index.html");
  assert.match(home, /Conecta cada hallazgo con su evidencia/);
  assert.match(home, /Armar una ficha de estudio/);
  assert.match(home, /Reúne entrevistas, sesiones UX, documentos y piezas culturales/);
  assert.match(home, /Cada estudio define sus propios criterios/);
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


test("sandbox adds, exports, downloads, clears, and rejects incomplete studies", async () => {
  const script = await read("assets/site.js");
  const nodes = new Map();
  const listeners = new Map();
  const storage = new Map();
  const makeNode = (id) => {
    const node = {
      id, value: "", textContent: "", hidden: false, dataset: {}, attributes: {}, children: [],
      classList: { toggle: () => false },
      querySelector: (selector) => {
        const child = makeNode(`${id}:${selector}`);
        node[selector === "p" ? "pNode" : "preNode"] = child;
        return child;
      },
      addEventListener: (type, fn) => listeners.set(`${id}:${type}`, fn),
      append: (...items) => node.children.push(...items),
      replaceChildren: (...items) => { node.children = [...items]; },
      setAttribute: (key, value) => { node.attributes[key] = value; },
      removeAttribute: (key) => { delete node.attributes[key]; if (key === "data-json") delete node.dataset.json; },
      focus: () => { document.activeElement = node; },
      scrollIntoView: () => {},
      click: () => { node.clicked = true; },
      reset: () => {},
    };
    return node;
  };
  const document = {
    activeElement: null,
    querySelector(selector) {
      const id = selector.startsWith("#") ? selector.slice(1) : selector;
      if (!nodes.has(id)) nodes.set(id, makeNode(id));
      return nodes.get(id);
    },
    createElement: (tag) => makeNode(tag),
  };
  const revoked = [];
  const blobs = [];
  const context = {
    document,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789abc" },
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; blobs.push(this); } },
    URL: { createObjectURL: () => "blob:demo", revokeObjectURL: (url) => revoked.push(url) },
    window: { setTimeout: (fn) => fn() },
  };
  vm.runInNewContext(script, context);
  const click = async (id) => listeners.get(`${id}:click`)();

  await click("download-brief");
  assert.equal(nodes.get("sandbox-result").hidden, false);
  assert.match(nodes.get("sandbox-result").pNode.textContent, /Completa/);
  assert.equal(document.activeElement, nodes.get("study-title"));
  assert.equal(blobs.length, 0);

  document.querySelector("#study-title").value = "Prueba UX";
  document.querySelector("#study-question").value = "¿Dónde se interrumpe la tarea?";
  document.querySelector("#unit-label").value = "Regreso a inicio";
  document.querySelector("#unit-locator").value = "Sesión 01 · 00:42";
  await click("add-unit");
  assert.equal(nodes.get("unit-count").textContent, "1");
  assert.equal(JSON.parse(storage.get("cultural-analysis-sandbox-v1"))[0].label, "Regreso a inicio");
  await click("build-brief");
  const brief = JSON.parse(nodes.get("sandbox-result").dataset.json);
  assert.equal(brief.project.title, "Prueba UX");
  assert.equal(brief.project.units.length, 1);
  await click("download-brief");
  assert.equal(blobs.length, 1);
  assert.match(blobs[0].type, /^application\/json/);
  assert.deepEqual(revoked, ["blob:demo"]);
  await click("clear-demo");
  assert.equal(nodes.get("unit-count").textContent, "0");
  assert.equal(nodes.get("sandbox-result").hidden, true);
  assert.equal(JSON.parse(storage.get("cultural-analysis-sandbox-v1")).length, 0);
});



test("build fingerprints the immutable interactive asset and rewrites every route", async () => {
  const script = await read("assets/site.js");
  const fingerprint = createHash("sha256").update(script).digest("hex").slice(0, 12);
  const expected = `/assets/site.${fingerprint}.js`;
  const routes = ["index.html", "demo/index.html", "plans/index.html", "privacy/index.html"];
  for (const route of routes) {
    const html = await readFile(join(root, "dist", route), "utf8");
    assert.ok(html.includes(`src="${expected}"`), route);
    assert.ok(!html.includes('src="/assets/site.js"'), route);
  }
  await access(join(root, "dist", `assets/site.${fingerprint}.js`));
  await assert.rejects(access(join(root, "dist", "assets/site.js")));
});
