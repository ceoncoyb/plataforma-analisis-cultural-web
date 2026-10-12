import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createHash } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(join(root, "public", path), "utf8");

test("product site presents the corpus lab as cross-disciplinary and configurable", async () => {
  const home = await read("index.html");
  const demo = await read("demo/index.html");
  assert.match(home, /Conecta cada hallazgo con su evidencia/);
  assert.match(home, /Investigación de experiencia \(UX\)/);
  assert.match(home, /Estudios culturales y de medios/);
  assert.match(demo, /Tu producto, tu corpus, tu método/);
  assert.match(demo, /El caso audiovisual es un formato de trabajo, no un molde/);
  for (const use of ["Producto / servicio", "Investigación UX", "Cultura y medios", "Políticas / sistemas", "Estudio audiovisual"]) assert.ok(demo.includes(use), `missing adaptable profile ${use}`);
});

test("corpus lab loads real local video and supports synchronized interval controls", async () => {
  const demo = await read("demo/index.html");
  const script = await read("assets/site.js");
  assert.match(demo, /id="media-files" type="file"[^>]*multiple/);
  assert.match(demo, /accept="video\/\*,audio\/\*,image\/\*/);
  assert.match(demo, /id="media-stage"/);
  assert.match(demo, /id="mark-start"/);
  assert.match(demo, /id="mark-end"/);
  assert.match(demo, /id="capture-frame"/);
  assert.match(script, /document\.createElement\("video"\)/);
  assert.match(script, /loadedmetadata/);
  assert.match(script, /timeupdate/);
  assert.match(script, /canvas\.toBlob/);
  assert.match(script, /startSeconds: rangeStart/);
});

test("lab storage and exports include project scope, corpus annotations and explicit local-only boundaries", async () => {
  const demo = await read("demo/index.html");
  const script = await read("assets/site.js");
  assert.match(demo, /Los archivos permanecen en este navegador y no se suben/);
  assert.match(demo, /No es la D1 ni escribe en el plugin conectado/);
  assert.match(demo, /id="import-project"/);
  assert.match(demo, /id="export-project"/);
  assert.match(script, /localStorage\.setItem\(storageKey/);
  assert.match(script, /format: "cultural-analysis-workspace"/);
  assert.match(script, /imported_source_document: sourceDocument/);
  assert.match(script, /No se escribe al MCP/);
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

test("project build fingerprints the interactive asset and rewrites every route", async () => {
  const script = await read("assets/site.js");
  const fingerprint = createHash("sha256").update(script).digest("hex").slice(0, 12);
  const routes = ["index.html", "demo/index.html", "plans/index.html", "privacy/index.html"];
  for (const route of routes) {
    const html = await readFile(join(root, "dist", route), "utf8");
    assert.match(html, new RegExp(`/assets/site\\.${fingerprint}\\.js`), route);
    assert.doesNotMatch(html, /\/assets\/site\.js(?:["?])/);
  }
  await access(join(root, "dist", `assets/site.${fingerprint}.js`));
  await assert.rejects(access(join(root, "dist", "assets/site.js")));
});

test("browser workflow annotates a real selected video interval and persists/export metadata", async () => {
  const script = await read("assets/site.js");
  const nodes = new Map(); const storage = new Map(); const blobs = []; const listeners = new Map();
  class Node {
    constructor(tag = "div", id = "") { this.tagName = tag.toUpperCase(); this.id = id; this.value = ""; this.textContent = ""; this.hidden = false; this.dataset = {}; this.children = []; this.attributes = {}; this.options = []; this.files = []; this.currentTime = 5.25; this.duration = 45; this.videoWidth = 640; this.videoHeight = 360; this.classList = { toggle: () => false }; }
    addEventListener(type, fn) { listeners.set(`${this.id || this.tagName}:${type}`, fn); }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = [...items]; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    focus() { this.focused = true; }
    click() { this.clicked = true; }
    querySelector(selector) { if (selector === "video, audio") return this.children.find((item) => item.tagName === "VIDEO" || item.tagName === "AUDIO") || null; if (selector === ".media-empty") return this.children.find((item) => item.className === "media-empty") || null; return null; }
    toBlob(callback) { callback({ type: "image/jpeg" }); }
  }
  const document = {
    querySelector(selector) { const id = selector.startsWith("#") ? selector.slice(1) : selector; if (!nodes.has(id)) { const node = new Node("div", id); if (id === "study-field") node.options = ["Producto / servicio", "Investigación UX", "Cultura y medios", "Investigación cualitativa", "Políticas / sistemas", "Estudio audiovisual", "Otro"].map((value) => ({ value })); nodes.set(id, node); } return nodes.get(id); },
    createElement(tag) { return new Node(tag); },
  };
  class FakeVideo extends Node { constructor() { super("video"); } }
  const context = {
    document, HTMLVideoElement: FakeVideo, crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789abc" },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    URL: { createObjectURL: () => "blob:local", revokeObjectURL: () => {} },
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; blobs.push(this); } },
    window: { setTimeout: (fn) => fn() },
  };
  vm.runInNewContext(script, context);
  const click = (id) => listeners.get(`${id}:click`)();
  const projectTitle = document.querySelector("#study-title"); projectTitle.value = "Prueba de producto"; listeners.get("study-title:input")();
  document.querySelector("#study-question").value = "¿En qué momento se interrumpe el flujo?"; listeners.get("study-question:input")();
  const input = document.querySelector("#media-files"); const videoFile = { name: "demo.mp4", type: "video/mp4", size: 1200000 };
  await listeners.get("media-files:change")({ target: { files: [videoFile], value: "" } });
  const video = document.querySelector("#media-stage").children[0];
  assert.equal(video.tagName, "VIDEO");
  listeners.get("VIDEO:loadedmetadata")();
  video.currentTime = 5.25; click("mark-start");
  video.currentTime = 12.75; click("mark-end");
  document.querySelector("#annotation-label").value = "Retorno al inicio";
  document.querySelector("#annotation-description").value = "La interfaz devuelve la sesión a la pantalla inicial.";
  document.querySelector("#annotation-reading").value = "Posible ruptura de continuidad del flujo.";
  click("save-annotation");
  const saved = JSON.parse(storage.get("cultural-corpus-lab-v2"));
  assert.equal(saved.project.title, "Prueba de producto");
  assert.equal(saved.units.length, 1);
  assert.equal(saved.units[0].mediaName, "demo.mp4");
  assert.equal(saved.units[0].startSeconds, 5.25);
  assert.equal(saved.units[0].endSeconds, 12.75);
  assert.equal(saved.units[0].locator, "00:05.250–00:12.750");
  click("export-project");
  const exported = JSON.parse(blobs.at(-1).parts[0]);
  assert.equal(exported.format, "cultural-analysis-workspace");
  assert.equal(exported.units[0].description, "La interfaz devuelve la sesión a la pantalla inicial.");
  assert.match(exported.note, /No se escribe al MCP/);
});
