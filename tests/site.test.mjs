import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { projectExportToMultimodalReviewManifest, validateCandidateDecision, loadReviewDraft, saveReviewDraft, createReviewExport } from "../public/laboratorio/multimodal-review.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(join(root, "public", path), "utf8");

test("product site presents the corpus lab as cross-disciplinary and configurable", async () => {
  const home = await read("index.html");
  const demo = await read("demo/index.html");
  assert.match(home, /Sigue cada hallazgo hasta la evidencia que lo sostiene/);
  assert.match(home, /Investigación de experiencia \(UX\)/);
  assert.match(home, /Estudios culturales y de medios/);
  assert.match(home, /Abrir la demo práctica/);
  assert.match(home, /Video y audio con controles temporales/);
  assert.match(home, /El análisis audiovisual es un piloto especializado/);
  assert.match(demo, /id="load-sample"/);
  assert.match(demo, /ficha sintética carga el estudio/i);
  assert.match(demo, /no reemplaza tu proyecto/i);
  assert.match(demo, /id="study-field"/);
  assert.match(demo, /tu método/i);
  assert.match(demo, /no se transcribe ni se analiza automáticamente/i);
  assert.match(demo, /no se sube ni se envía a ChatGPT/i);
  assert.match(demo, /No es la D1 ni escribe en el plugin de ChatGPT/);
  assert.match(demo, /id="import-project"/);
  assert.match(demo, /id="export-project"/);
  assert.match(demo, /href="\/#recorrido"/);
});

test("primary CTAs route to the actual public demo, with a clear return path", async () => {
  const home = await read("index.html");
  const demo = await read("demo/index.html");
  assert.match(home, /href="\/demo\/">Probar gratis, sin cuenta/);
  assert.ok((home.match(/href="\/demo\//g) || []).length >= 3);
  assert.match(demo, /class="brand" href="\/" aria-label="Inicio"/);
  assert.match(demo, /href="\/#recorrido"/);
  assert.match(home, /href="\/assets\/guia-rapida\.mp4"|source src="\/assets\/guia-rapida\.mp4"/);
  await access(join(root, "public", "assets/guia-rapida.mp4"));
  await access(join(root, "public", "assets/evidence-flow.jpg"));
});

test("all public entry points stay on Pages and do not redirect to the legacy ChatGPT Site", async () => {
  for (const route of ["index.html", "demo/index.html", "laboratorio/index.html"]) {
    const html = await read(route);
    assert.doesNotMatch(html, /analisis-cultural-mcp\.casadepartoswa496020\.chatgpt\.site/);
    assert.doesNotMatch(html, /href="https?:\/\/[^\"]*chatgpt\.site/i);
  }
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
  assert.match(script, /schema_version: 1/);
  assert.match(script, /local_demo_annotation/);
  assert.match(script, /requires_locator_for_structured_evidence/);
});

test("lab storage and exports include project scope, corpus annotations and explicit local-only boundaries", async () => {
  const demo = await read("demo/index.html");
  const privacy = await read("privacy/index.html");
  const script = await read("assets/site.js");
  assert.match(privacy, /Los medios seleccionados \(video, audio, imágenes y documentos\) se previsualizan desde memoria local/);
  assert.match(privacy, /La sincronización remota sigue pendiente de una prueba autenticada en producción/);
  assert.match(demo, /tu material no se sube ni se envía a ChatGPT/i);
  assert.match(demo, /No es la D1 ni escribe en el plugin de ChatGPT/);
  assert.match(demo, /id="import-project"/);
  assert.match(demo, /id="export-project"/);
  assert.match(script, /localStorage\.setItem\(storageKey/);
  assert.match(script, /format: "cultural-analysis-workspace"/);
  assert.match(script, /imported_source_document: sourceDocument/);
  assert.match(script, /No se escribe al MCP/);
});

test("all product routes expose SEO metadata, navigation and privacy", async () => {
  const routes = ["index.html", "demo/index.html", "laboratorio/index.html", "plans/index.html", "privacy/index.html", "support/index.html"];
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

test("corpus lab mobile grid can shrink without forcing horizontal overflow", async () => {
  const css = await read("assets/site.css");
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{\s*\.lab-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.lab-sidebar\s*,\s*\.lab-main\s*\{\s*min-width:\s*0\s*\}/);
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

test("audiovisual review route imports the plugin export, syncs review drafts to protected D1, and keeps media local", async () => {
  const html = await read("laboratorio/index.html");
  const script = await read("laboratorio/lab.js");
  assert.match(html, /Abrir demo en Pages/);
  assert.match(html, /type="module" src="\/laboratorio\/lab\.js"/);
  assert.match(html, /proyecto fuente queda en solo lectura/i);
  assert.match(html, /no se envía/i);
  assert.match(script, /projectExportToMultimodalReviewManifest/);
  assert.match(script, /createReviewExport/);
  assert.match(script, /URL\.createObjectURL\(file\)/);
  assert.match(script, /drawImage\(video,0,0\)/);
  assert.match(script, /Usar posición actual/);
  assert.match(script, /Ir al tiempo propuesto/);
  assert.match(await read("_headers"), /media-src 'self' blob:/);
  assert.match(script, /No se pudo importar este JSON/);
  assert.match(script, /fetch\(cloudUrl\(\)/);
  assert.match(script, /credentials:"same-origin"/);
  assert.match(html, /Borrar copia de D1/);
  assert.doesNotMatch(script, /\.put\s*\(/);
  assert.match(await read("../functions/_shared/access.js"), /cf-access-jwt-assertion/);
});

test("plugin export adaptation preserves IDs, deduplicates canonical collections, and permits projects without subsequences", async () => {
  const source = { format: "export_project", revision: 174, project: {
    id: "study-01", name: "Corpus", units: [
      { id: "seq-A", type: "sequence", start: "00:00", end: "00:20" },
      { id: "sub-A", type: "subsequence", sequence_id: "seq-A", start: "00:00", end: "00:20" },
      { id: "int-1", type: "interval", parent_id: "seq-A", start: "00:01", end: "00:03", locator: "corte 1", origin: "registro" },
      { id: "frame-1", type: "frame", parent_id: "int-1", timestamp: "00:01.5" },
    ], subsequences: [{ id: "sub-A", sequence_id: "seq-A", start: "00:00", end: "00:20" }, { id: "sub-B", sequence_id: "seq-A", start: "00:02", end: "00:12" }],
    frames: [{ id: "frame-1", parent_id: "int-1", timestamp: "00:01.5" }, { id: "frame-2", sequence_id: "seq-A", timestamp: "00:08" }],
    cut_candidates: [{ id: "cut-1", interval_id: "int-1", timestamp: "00:01.5" }, { id: "cut-1", interval_id: "int-1", timestamp: "00:01.5" }],
    evidence: [{ id: "ev-1", unit_id: "int-1", modality: "visual", locator: "00:01–00:03", content: "Cambio" }], interval_analyses: [{ id: "an-1", unit_id: "int-1", observable_visual: "Cambio de plano" }],
  }};
  const m = projectExportToMultimodalReviewManifest(source);
  assert.equal(m.project_id, "study-01"); assert.equal(m.revision, 174);
  assert.deepEqual(m.sequences.map((x) => x.id), ["seq-A"]);
  assert.deepEqual(m.segments.map((x) => x.id), ["sub-A", "sub-B"]);
  assert.deepEqual(m.intervals.map((x) => x.id), ["int-1"]);
  assert.deepEqual(m.frames.map((x) => x.id), ["frame-1", "frame-2"]);
  assert.equal(m.frames[0].interval_id, "int-1");
  assert.equal(m.frames[0].sequence_id, "seq-A");
  assert.equal(m.frames[0].start, "00:01.5");
  assert.equal(m.frames[0].hierarchy_method, "declared_interval_parent");
  assert.equal(m.frames[1].start_seconds, 8);

  assert.equal(m.cut_candidates.length, 1);
  assert.equal(m.intervals[0].evidence[0].id, "ev-1");
  assert.equal(m.intervals[0].analysis.id, "an-1");
  assert.equal(m.intervals[0].locator, "corte 1");
  assert.equal(source.project.cut_candidates.length, 2, "the imported object stays unchanged");

  const noSegments = projectExportToMultimodalReviewManifest({ project: { id: "plain", units: [
    { id: "only-seq", type: "sequence", start: 0, end: 30 },
    { id: "direct-int", type: "interval", parent_id: "only-seq", start: 1, end: 2 },
  ] } });
  assert.equal(noSegments.sequences[0].direct_interval_ids[0], "direct-int");
  assert.equal(noSegments.segments.length, 0);

  const pluginShape = projectExportToMultimodalReviewManifest({ project: { id: "plugin-shape", units: [
    { id: "seq-1", type: "sequence", start: "00:00:00", end: "00:09:00" },
    { id: "28", type: "interval", parent_id: "seq-1", start: "00:08:28.12", end: "00:08:45" },
    { id: "f13073S4", type: "frame", parent_id: 28,
      label: "Fotograma 59 · 00:08:42.92 · intervalo 28",
      locator: "frame nativo 13073 a 25 fps (00:08:42.92); intervalo 28 (00:08:28.12–00:08:45)" },
  ] } });
  assert.equal(pluginShape.frames[0].interval_id, "28");
  assert.equal(pluginShape.frames[0].sequence_id, "seq-1");
  assert.equal(pluginShape.frames[0].start, "00:08:42.92");
  assert.equal(pluginShape.frames[0].start_seconds, 522.92);
  assert.equal(pluginShape.frames[0].hierarchy_method, "declared_interval_parent");
  assert.equal(pluginShape.frames[0].declared_parent_id, 28, "retain the source parent value");

});

test("candidate decisions enforce local media, SHA identity, and inclusive timing tolerance; drafts recover and export separately", async () => {
  const validBase = { mediaAvailable: true, mediaIdentity: "verified", shaRequired: true, status: "confirmed", proposed: 1.5 };
  assert.equal(validateCandidateDecision({ ...validBase, observed: 1.54 }).ok, true);
  assert.equal(validateCandidateDecision({ ...validBase, observed: 1.54001 }).ok, false);
  assert.equal(validateCandidateDecision({ ...validBase, observed: 1.5, mediaIdentity: "mismatch" }).ok, false);
  assert.equal(validateCandidateDecision({ ...validBase, observed: 1.5, mediaAvailable: false }).ok, false);
  assert.equal(validateCandidateDecision({ ...validBase, observed: 1.5, status: "doubtful", mediaIdentity: "verified" }).ok, true);
  const memory = new Map(); const storage = { getItem: (k) => memory.get(k) || null, setItem: (k,v) => memory.set(k,v) };
  const draft = { annotations: [{ id: "note-1" }], cut_candidate_decisions: [{ candidate_id: "cut-1", status: "confirmed", project_revision: 174 }] };
  saveReviewDraft(storage,"study-01",174,draft);
  assert.deepEqual(loadReviewDraft(storage,"study-01",174),draft);
  assert.deepEqual(loadReviewDraft(storage,"study-01",173),{annotations:[],cut_candidate_decisions:[]});
  const out=createReviewExport({project_id:"study-01",revision:174}, { project:{id:"study-01"} }, draft.annotations,draft.cut_candidate_decisions);
  assert.equal(out.read_only_source,true); assert.equal(out.status,"human_review_unratified");
  assert.equal(out.cut_candidate_decisions[0].candidate_id,"cut-1");
});

test("project build fingerprints the interactive asset and rewrites every route", async () => {
  const script = await read("assets/site.js");
  const fingerprint = createHash("sha256").update(script).digest("hex").slice(0, 12);
  const stylesheet = await read("assets/site.css");
  const cssFingerprint = createHash("sha256").update(stylesheet).digest("hex").slice(0, 12);
  const routes = ["index.html", "demo/index.html", "laboratorio/index.html", "plans/index.html", "privacy/index.html"];
  for (const route of routes) {
    const html = await readFile(join(root, "dist", route), "utf8");
    assert.match(html, new RegExp(`/assets/site\\.${fingerprint}\\.js`), route);
    assert.match(html, new RegExp(`/assets/site\\.${cssFingerprint}\\.css`), route);
    assert.doesNotMatch(html, /\/assets\/site\.js(?:["?])/);
    assert.doesNotMatch(html, /\/assets\/site\.css(?:["?])/);
  }
  await access(join(root, "dist", `assets/site.${fingerprint}.js`));
  await access(join(root, "dist", `assets/site.${cssFingerprint}.css`));
  await assert.rejects(access(join(root, "dist", "assets/site.js")));
  await assert.rejects(access(join(root, "dist", "assets/site.css")));
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
    pause() { this.paused = true; }
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
    TextEncoder,
    navigator: { clipboard: { writeText: async (value) => { context.copiedPrompt = value; } } },
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
  click("prepare-chatgpt-export");
  const portable = JSON.parse(blobs.at(-1).parts[0]);
  assert.equal(portable.schema_version, 1);
  assert.match(portable.id, /^[a-z0-9][a-z0-9-]{1,80}$/);
  assert.equal(portable.name, "Prueba de producto");
  assert.deepEqual(portable.method_profile.layers.map((layer) => layer.id), ["observacion-empirica"]);
  assert.equal(portable.units.length, 1);
  assert.equal(portable.units[0].start, "00:05.250");
  assert.equal(portable.units[0].end, "00:12.750");
  assert.equal(portable.units[0].local_demo_annotation.provisional_reading, "Posible ruptura de continuidad del flujo.");
  assert.equal(portable.units[0].local_demo_annotation.interpretation_status, "LOCAL_PROVISIONAL_NOT_A_MCP_READING");
  assert.equal(portable.sources[0].origin, "user-selected-local-file");
  assert.equal(portable.sources[0].local_only, true);
  assert.equal(portable.evidence[0].unit_id, portable.units[0].id);
  assert.equal(portable.evidence[0].locator, "00:05.250–00:12.750");
  assert.equal(portable.evidence[0].content, "La interfaz devuelve la sesión a la pantalla inicial.");
  assert.equal(portable.readings.length, 0);
  assert.equal(portable.local_demo_transfer.media_binaries_included, false);
  const importInput = document.querySelector("#import-project");
  const transferredFile = { name: "portable.json", text: async () => JSON.stringify(portable) };
  await listeners.get("import-project:change")({ target: { files: [transferredFile], value: "" } });
  assert.equal(document.querySelector("#study-title").value, "Prueba de producto");
  assert.equal(document.querySelector("#unit-count").textContent, "1");
  assert.match(document.querySelector("#save-status").textContent, /Proyecto compatible abierto/);
  click("prepare-chatgpt-export");
  const copiedProject = JSON.parse(blobs.at(-1).parts[0]);
  assert.match(copiedProject.id, /-copy-/);
  assert.equal(copiedProject.units.length, 1);
  assert.equal(copiedProject.evidence.length, 1);
  assert.equal(copiedProject.evidence[0].content, portable.evidence[0].content);
  assert.equal(copiedProject.sources.length, portable.sources.length);
  await listeners.get("copy-import-prompt:click")();
  assert.match(context.copiedPrompt, /proyecto nuevo/);
  assert.match(context.copiedPrompt, /No modifiques ningún proyecto existente/);
  click("load-sample");
  const sample = JSON.parse(storage.get("cultural-corpus-lab-sample-v1"));
  assert.equal(sample.project.field, "Investigación UX");
  assert.equal(sample.units[0].origin, "annotation");
  assert.match(sample.units[0].description, /Ejemplo ficticio/);
  assert.equal(sample.units[0].syntheticExample, true);
  click("prepare-chatgpt-export");
  const sampleTransfer = JSON.parse(blobs.at(-1).parts[0]);
  assert.equal(sampleTransfer.evidence.length, 1);
  assert.equal(sampleTransfer.evidence[0].locator, "Escenario sintético · paso 4 de 6");
  assert.equal(sampleTransfer.evidence[0].content, sample.units[0].description);
  assert.equal(sampleTransfer.sources[0].origin, "synthetic-demo-example");
  assert.match(sampleTransfer.sources[0].reason, /ficticio/);
  click("new-annotation");
  document.querySelector("#annotation-label").value = "Nota manual sin fuente";
  document.querySelector("#annotation-description").value = "Se conserva como nota local sin inventar un localizador.";
  click("save-annotation");
  click("prepare-chatgpt-export");
  const sampleWithUnlinkedNote = JSON.parse(blobs.at(-1).parts[0]);
  assert.equal(sampleWithUnlinkedNote.units.length, 2);
  assert.equal(sampleWithUnlinkedNote.evidence.length, 1);
  assert.equal(sampleWithUnlinkedNote.units[1].local_demo_annotation.requires_locator_for_structured_evidence, true);
  assert.equal(sampleWithUnlinkedNote.units[1].local_demo_annotation.observation, "Se conserva como nota local sin inventar un localizador.");
  assert.equal(JSON.parse(storage.get("cultural-corpus-lab-v2")).project.title, "Prueba de producto");
  click("restore-workspace");
  assert.equal(document.querySelector("#study-title").value, "Prueba de producto");
  const siteExport = {
    format: "analysis-cultural-study", version: 1,
    project: { title: "Audio exportado desde el Site", field: "Estudio audiovisual", question: "¿Qué ocurre en este intervalo?" },
    media: { filename: "secuencia.mp4", duration_seconds: 28, local_only: true },
    units: [{ unit_id: "intervalo-01", start_seconds: 12, end_seconds: 19, label: "Giro de plano", observation: "La cámara cambia de dirección al entrar el personaje.", source: { type: "media", locator: "00:12–00:19" } }],
  };
  await listeners.get("import-project:change")({ target: { files: [{ name: "site-export.json", text: async () => JSON.stringify(siteExport) }], value: "" } });
  assert.equal(document.querySelector("#study-title").value, "Audio exportado desde el Site");
  assert.equal(document.querySelector("#unit-count").textContent, "1");
  click("prepare-chatgpt-export");
  const siteMcpCopy = JSON.parse(blobs.at(-1).parts[0]);
  assert.equal(siteMcpCopy.schema_version, 1);
  assert.equal(siteMcpCopy.units[0].id, "intervalo-01");
  assert.equal(siteMcpCopy.units[0].start, "00:12.000");
  assert.equal(siteMcpCopy.units[0].end, "00:19.000");
  assert.equal(siteMcpCopy.evidence[0].locator, "00:12–00:19");
  assert.equal(siteMcpCopy.evidence[0].content, "La cámara cambia de dirección al entrar el personaje.");
  assert.equal(siteMcpCopy.sources[0].title, "secuencia.mp4");
  assert.equal(siteMcpCopy.sources[0].local_only, true);
});




test("controlled academic reversioning route provides a local-only auditable draft workflow", async () => {
  const page = await read("reversionados/index.html");
  const css = await read("assets/site.css");
  assert.match(page, /Protocolo en diseño/);
  assert.match(page, /no se guardan ni se envían/i);
  assert.match(page, /Hallazgos comprobados/);
  assert.match(page, /Pendiente de especificación; no inferido automáticamente/);
  assert.match(page, /Descargar Markdown/);
  assert.match(page, /No se ha guardado ni enviado/);
  assert.match(css, /\.revision-workbench/);
  assert.match(page, /Revisión y aprobación autoral documentadas/);
});
