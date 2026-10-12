const toggle = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("[data-menu]");
toggle?.addEventListener("click", () => {
  const open = menu?.classList.toggle("is-open") ?? false;
  toggle.setAttribute("aria-expanded", String(open));
});

const form = document.querySelector("#sandbox-form");
if (form) {
  // Kept for older embedded copies; the current public demo uses the corpus lab below.
}

const lab = document.querySelector("#media-files");
if (lab) {
  const personalStorageKey = "cultural-corpus-lab-v2";
  const sampleStorageKey = "cultural-corpus-lab-sample-v1";
  let storageKey = personalStorageKey;
  const $ = (selector) => document.querySelector(selector);
  const videoTransport = $("#video-transport");
  const mediaStage = $("#media-stage");
  const importInput = $("#import-project");
  const mediaInput = $("#media-files");
  let state = { project: { title: "", field: "Producto / servicio", question: "" }, units: [] };
  let sourceDocument = null;
  let mediaFiles = [];
  let personalMediaSnapshot = null;
  let activeIndex = -1;
  let activeUnitId = null;
  let objectUrls = [];
  let rangeStart = null;
  let rangeEnd = null;

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && saved.project && Array.isArray(saved.units)) {
      state = { project: saved.project, units: saved.units };
      sourceDocument = saved.sourceDocument || null;
    }
  } catch { /* Keep a clean workspace when local storage contains invalid JSON. */ }

  const safe = (value, fallback = "") => typeof value === "string" ? value : fallback;
  const pad = (number, length = 2) => String(number).padStart(length, "0");
  const chatImportPrompt = "Importa el archivo adjunto como proyecto nuevo con Plataforma de análisis cultural. Conserva unidades, fuentes, localizadores y observaciones. Verifica el ID y el número de unidades importadas. No modifiques ningún proyecto existente.";
  function stableHash(value) {
    let first = 0x811c9dc5, second = 0x9e3779b9;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return (first >>> 0).toString(36).padStart(7, "0") + (second >>> 0).toString(36).padStart(7, "0");
  }
  function slugify(value) {
    return safe(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "proyecto-analisis";
  }
  function mcpImportDocument() {
    const name = safe(state.project.title).trim() || "Proyecto de análisis";
    const layerId = "observacion-empirica";
    const names = [...new Set(state.units.map((unit) => safe(unit.mediaName).trim()).filter(Boolean))];
    const sourceForMedia = new Map();
    const sources = names.map((mediaName, index) => {
      const id = `local-media-${String(index + 1).padStart(3, "0")}`;
      sourceForMedia.set(mediaName, id);
      return { id, origin: "user-selected-local-file", provider: "local-browser", tool_name: "corpus-lab-file-input", title: mediaName, external_item_id: `local-file:${mediaName}`, actor: "Usuario", reason: "Material seleccionado en el navegador; el archivo binario no forma parte de esta transferencia.", local_only: true };
    });
    const syntheticSourceId = state.units.some((unit) => unit.syntheticExample === true) ? "local-synthetic-example" : null;
    if (syntheticSourceId) sources.push({ id: syntheticSourceId, origin: "synthetic-demo-example", provider: "public-demo", tool_name: "guided-sample", title: "Caso sintético de continuidad de una tarea", external_item_id: "synthetic-case:task-continuity", actor: "Demostración", reason: "Caso didáctico ficticio; no procede de participantes ni de un producto real." });
    const units = state.units.map((unit, index) => {
      const id = safe(unit.id || unit.unit_id, `unit-${index + 1}`);
      const type = safe(unit.modality || unit.channel, "corpus");
      const sourceId = sourceForMedia.get(safe(unit.mediaName).trim()) || (unit.syntheticExample ? syntheticSourceId : null);
      const observation = safe(unit.description).trim();
      const locator = safe(unit.locator).trim();
      const start = Number.isFinite(unit.startSeconds) ? timecode(unit.startSeconds) : "";
      const end = Number.isFinite(unit.endSeconds) ? timecode(unit.endSeconds) : "";
      return {
        id, type, label: unitLabel(unit), ...(locator ? { locator } : {}),
        ...(start ? { start } : {}), ...(end ? { end } : {}), ...(sourceId ? { source_id: sourceId } : {}),
        local_demo_annotation: {
          channel: safe(unit.channel), tags: safe(unit.tags), observation,
          provisional_reading: safe(unit.reading),
          interpretation_status: unit.reading ? "LOCAL_PROVISIONAL_NOT_A_MCP_READING" : "NOT_PROVIDED",
          requires_locator_for_structured_evidence: !locator,
        },
      };
    });
    const ids = units.map((unit) => unit.id);
    if (new Set(ids).size !== ids.length) throw new Error("Hay IDs de unidad repetidos. Corrígelos en la ficha antes de transferirla; no se renombraron automáticamente.");
    const evidence = units.flatMap((unit, index) => {
      const observation = unit.local_demo_annotation.observation;
      const sourceId = unit.source_id;
      if (!observation || !unit.locator || !sourceId) return [];
      return [{ id: `local-evidence-${String(index + 1).padStart(3, "0")}`, unit_id: unit.id, modality: unit.type, kind: "user_observation", locator: unit.locator, content: observation, source_id: sourceId, actor: "Usuario" }];
    });
    const media = [...new Set(units.map((unit) => unit.type).filter(Boolean))];
    const base = {
      schema_version: 1,
      name,
      medium: media.length ? media : ["no especificado"],
      project: {
        objectives: [],
        questions: safe(state.project.question).trim() ? [safe(state.project.question).trim()] : [],
        hypotheses: [],
        inference_limits: ["Transferencia desde una demo local. Los binarios multimedia no se incluyen. Las lecturas provisionales se conservan como notas locales y no se presentan como lecturas MCP validadas."],
        field_of_study: safe(state.project.field),
      },
      method_profile: { layers: [{ id: layerId, label: "Observación empírica" }], operation_authority: {} },
      units, evidence, readings: [], events: [], sources, repertories: [], analysis_modules: [], sync_groups: [], analysis_relations: [],
      local_demo_transfer: { format: "cultural-analysis-workspace-to-mcp", version: 1, media_binaries_included: false, annotation_extension: "unit.local_demo_annotation", ...(sourceDocument && sourceDocument.schema_version !== 1 ? { source_document: sourceDocument } : {}) },
    };
    const serialized = JSON.stringify(base);
    if (sourceDocument?.schema_version === 1 && sourceDocument.project && Array.isArray(sourceDocument.units)) {
      const original = JSON.parse(JSON.stringify(sourceDocument));
      const originalIds = new Set(original.units.map((unit) => unit.id));
      const additions = base.units.filter((unit) => !originalIds.has(unit.id));
      const additionIds = new Set(additions.map((unit) => unit.id));
      const existingSourceIds = new Set((original.sources || []).map((source) => source.id));
      const existingEvidenceIds = new Set((original.evidence || []).map((item) => item.id));
      const additionsSources = base.sources.filter((source) => additions.some((unit) => unit.source_id === source.id) && !existingSourceIds.has(source.id));
      const additionsEvidence = base.evidence.filter((item) => additionIds.has(item.unit_id) && !existingEvidenceIds.has(item.id));
      const mergedUnits = [...original.units, ...additions];
      if (new Set(mergedUnits.map((unit) => unit.id)).size !== mergedUnits.length) throw new Error("La ficha contiene IDs de unidad repetidos. No se cambió ni se combinó ningún registro.");
      original.id = `${slugify(original.id || name)}-copy-${stableHash(serialized).slice(0, 12)}`;
      original.name = name;
      original.medium = [...new Set([...(Array.isArray(original.medium) ? original.medium : [original.medium]), ...additions.map((unit) => unit.type)].filter(Boolean))];
      original.project = { ...(original.project || {}), field_of_study: safe(state.project.field) };
      original.project.questions = safe(state.project.question).trim() ? [safe(state.project.question).trim()] : (original.project.questions || []);
      original.units = mergedUnits;
      original.sources = [...(original.sources || []), ...additionsSources];
      original.evidence = [...(original.evidence || []), ...additionsEvidence];
      original.local_demo_transfer = { format: "cultural-analysis-workspace-to-mcp", version: 1, media_binaries_included: false, copied_from_project_id: sourceDocument.id, annotation_extension: "unit.local_demo_annotation" };
      return original;
    }
    const id = `${slugify(name)}-${stableHash(serialized)}`;
    return { id, ...base };
  }
  function timecode(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00.000";
    const whole = Math.floor(seconds);
    return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}.${pad(Math.floor((seconds % 1) * 1000), 3)}`;
  }
  function parseTime(value) {
    if (Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
    if (!match) return null;
    return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] || 0}`);
  }
  function status(message) { $("#save-status").textContent = message; }
  function persist() {
    try {
      const stored = { project: state.project, units: state.units, sourceDocument, savedAt: new Date().toISOString() };
      const json = JSON.stringify(stored);
      if (json.length > 3_800_000) {
        status("El espacio local está casi lleno. Exporta el JSON para conservar los cambios.");
        return false;
      }
      localStorage.setItem(storageKey, json);
      status("Guardado en este navegador · " + new Date().toLocaleTimeString());
      return true;
    } catch {
      status("El navegador no pudo guardar más datos. Exporta el JSON antes de cerrar.");
      return false;
    }
  }
  function syncProjectFields() {
    $("#study-title").value = safe(state.project.title);
    if (![...$("#study-field").options].some((option) => option.value === state.project.field)) {
      const option = document.createElement("option"); option.value = state.project.field; option.textContent = state.project.field; $("#study-field").append(option);
    }
    $("#study-field").value = safe(state.project.field, "Producto / servicio");
    $("#study-question").value = safe(state.project.question);
    renderProjectHeading();
  }
  function renderProjectHeading() {
    $("#lab-project-heading").textContent = state.project.title || "Nuevo espacio de análisis";
    $("#lab-project-subtitle").textContent = [state.project.field, state.project.question].filter(Boolean).join(" · ") || "Configura el caso o abre una ficha JSON para empezar.";
  }
  function unitLabel(unit) { return safe(unit.label || unit.title || unit.name, "Observación"); }
  function renderUnits() {
    const list = $("#unit-list"); list.replaceChildren();
    const entries = [...state.units].sort((a, b) => (a.startSeconds ?? Infinity) - (b.startSeconds ?? Infinity));
    if (!entries.length) { const empty = document.createElement("p"); empty.className = "empty-list"; empty.textContent = "El corpus está vacío. Carga un medio o añade una observación."; list.append(empty); }
    for (const unit of entries) {
      const row = document.createElement("div"); row.className = `unit-row ${unit.origin === "imported" ? "is-imported" : "is-new"}${unit.id === activeUnitId ? " is-selected" : ""}`;
      const select = document.createElement("button"); select.type = "button"; select.className = "unit-select";
      const title = document.createElement("strong"); title.textContent = unitLabel(unit);
      const locator = document.createElement("span"); locator.textContent = unit.locator || (unit.startSeconds != null ? timecode(unit.startSeconds) : unit.channel || "Sin localizador");
      select.append(title, locator); select.addEventListener("click", () => selectUnit(unit));
      const kind = document.createElement("span"); kind.className = "row-type"; kind.textContent = unit.origin === "imported" ? "base" : safe(unit.channel, "nota");
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "row-remove"; remove.textContent = "Quitar"; remove.setAttribute("aria-label", `Quitar ${unitLabel(unit)}`);
      remove.disabled = unit.origin === "imported";
      remove.addEventListener("click", () => { state.units = state.units.filter((item) => item.id !== unit.id); persist(); renderUnits(); });
      row.append(select, kind, remove); list.append(row);
    }
    $("#unit-count").textContent = String(state.units.length);
  }
  function renderMediaList() {
    const list = $("#media-list"); list.replaceChildren();
    $("#file-summary").textContent = mediaFiles.length ? `${mediaFiles.length} material${mediaFiles.length === 1 ? "" : "es"} disponibles en esta sesión` : "Ningún material cargado";
    if (!mediaFiles.length) { const empty = document.createElement("p"); empty.className = "empty-list"; empty.textContent = "Los medios desaparecen al cerrar la sesión; vuelve a seleccionarlos cuando abras el JSON."; list.append(empty); return; }
    mediaFiles.forEach((file, index) => {
      const row = document.createElement("div"); row.className = `media-row${index === activeIndex ? " is-selected" : ""}`;
      const select = document.createElement("button"); select.type = "button"; select.className = "media-select";
      const name = document.createElement("strong"); name.textContent = file.name;
      const details = document.createElement("span"); details.textContent = `${formatSize(file.size)} · ${file.type || "formato local"}`;
      select.append(name, details); select.addEventListener("click", () => selectMedia(index));
      const kind = document.createElement("span"); kind.className = "row-type"; kind.textContent = mediaType(file);
      row.append(select, kind); list.append(row);
    });
  }
  function formatSize(bytes) { return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`; }
  function mediaType(file) { return file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "imagen" : "archivo"; }
  function emptyViewer(title = "Carga o selecciona un material", message = "Elige un archivo para previsualizarlo y asociar observaciones.") {
    mediaStage.replaceChildren();
    const empty = document.createElement("div"); empty.className = "media-empty";
    const icon = document.createElement("span"); icon.textContent = "▶";
    const heading = document.createElement("strong"); heading.textContent = title;
    const description = document.createElement("p"); description.textContent = message;
    empty.append(icon, heading, description); mediaStage.append(empty); videoTransport.hidden = true;
  }
  function selectMedia(index) {
    activeIndex = index; rangeStart = null; rangeEnd = null;
    const file = mediaFiles[index]; if (!file) return;
    objectUrls.forEach(URL.revokeObjectURL); objectUrls = [];
    const url = URL.createObjectURL(file); objectUrls.push(url);
    $("#active-media-title").textContent = file.name;
    mediaStage.replaceChildren(); videoTransport.hidden = true;
    let element;
    if (file.type.startsWith("video/")) {
      element = document.createElement("video"); element.controls = true; element.playsInline = true; element.preload = "metadata";
      element.addEventListener("loadedmetadata", () => { videoTransport.hidden = false; $("#duration-time").textContent = "/ " + timecode(element.duration); updateCurrentTime(); });
      element.addEventListener("timeupdate", updateCurrentTime);
      element.addEventListener("error", () => emptyViewer("No se pudo reproducir este video", "Prueba con MP4/H.264 o WebM compatible con este navegador."));
    } else if (file.type.startsWith("audio/")) {
      element = document.createElement("audio"); element.controls = true; element.preload = "metadata";
      element.addEventListener("loadedmetadata", () => { videoTransport.hidden = false; $("#duration-time").textContent = "/ " + timecode(element.duration); updateCurrentTime(); });
      element.addEventListener("timeupdate", updateCurrentTime);
    } else if (file.type.startsWith("image/")) {
      element = document.createElement("img"); element.alt = `Vista previa de ${file.name}`;
    } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      element = document.createElement("iframe"); element.title = `Vista previa de ${file.name}`;
    } else if (/\.(txt|md|csv|json)$/i.test(file.name) && typeof file.text === "function") {
      element = document.createElement("pre"); element.className = "text-preview"; element.setAttribute("aria-label", `Vista previa de ${file.name}`); element.textContent = "Cargando vista previa local…";
      file.text().then((text) => { element.textContent = text.slice(0, 40000) + (text.length > 40000 ? "\n\n…vista limitada a 40 000 caracteres" : ""); }).catch(() => { element.textContent = "No se pudo leer el archivo en este navegador."; });
    } else {
      emptyViewer(file.name, "Este formato queda asociado al corpus; el navegador no tiene vista previa integrada para él.");
      const link = document.createElement("a"); link.href = url; link.download = file.name; link.className = "button button-light button-small"; link.textContent = "Abrir o descargar archivo"; $(".media-empty").append(link);
    }
    if (element) { element.src = url; mediaStage.append(element); }
    renderMediaList();
    const matching = state.units.find((unit) => unit.mediaName === file.name && unit.startSeconds != null);
    if (matching) selectUnit(matching, false);
  }
  function activePlayer() { return mediaStage.querySelector("video, audio"); }
  function updateCurrentTime() {
    const player = activePlayer(); if (player) $("#current-time").textContent = timecode(player.currentTime);
  }
  function updateRangeText() {
    const parts = [];
    if (rangeStart != null) parts.push("Inicio " + timecode(rangeStart));
    if (rangeEnd != null) parts.push("final " + timecode(rangeEnd));
    $("#marked-range").textContent = parts.length ? parts.join(" · ") : "Marca inicio y final para crear una unidad temporal precisa.";
    if (rangeStart != null) $("#annotation-locator").value = `${timecode(rangeStart)}${rangeEnd != null ? "–" + timecode(rangeEnd) : ""}`;
  }
  function selectUnit(unit, fillForm = true) {
    activeUnitId = unit.id; renderUnits();
    if (unit.mediaName) {
      const index = mediaFiles.findIndex((file) => file.name === unit.mediaName);
      if (index >= 0 && index !== activeIndex) selectMedia(index);
    }
    const player = activePlayer();
    if (player && unit.startSeconds != null) { player.currentTime = unit.startSeconds; player.pause(); }
    if (fillForm && unit.origin !== "imported") {
      $("#annotation-label").value = unitLabel(unit); $("#annotation-channel").value = unit.channel || "Visual";
      $("#annotation-locator").value = unit.locator || ""; $("#annotation-tags").value = unit.tags || "";
      $("#annotation-description").value = unit.description || ""; $("#annotation-reading").value = unit.reading || "";
      $("#save-annotation").dataset.editId = unit.id; $("#save-annotation").textContent = "Actualizar observación";
    }
  }
  function updateProject() {
    state.project = { ...state.project, title: $("#study-title").value.trim(), field: $("#study-field").value, question: $("#study-question").value.trim() };
    renderProjectHeading(); persist();
  }
  function parseImportedUnit(unit, index) {
    const locator = safe(unit.locator || unit.timecode || unit.timestamp || unit.start_time);
    const startRaw = unit.startSeconds ?? unit.start_seconds ?? (unit.start_ms != null ? Number(unit.start_ms) / 1000 : unit.start ?? locator);
    const endRaw = unit.endSeconds ?? unit.end_seconds ?? (unit.end_ms != null ? Number(unit.end_ms) / 1000 : unit.end ?? "");
    const start = parseTime(startRaw);
    const end = parseTime(endRaw);
    return { id: safe(unit.id || unit.unit_id, `SRC-${index + 1}`), label: safe(unit.label || unit.title || unit.name, `Unidad ${index + 1}`), locator, modality: safe(unit.modality || unit.type, "corpus"), startSeconds: start, endSeconds: end, origin: "imported" };
  }
  function importDocument(documentData) {
    if (documentData?.format === "cultural-analysis-workspace" && documentData.project && Array.isArray(documentData.units)) {
      sourceDocument = documentData.imported_source_document || null;
      state = { project: { ...documentData.project }, units: documentData.units };
      activeUnitId = null; syncProjectFields(); renderUnits(); persist();
      status(`Espacio abierto: ${state.units.length} unidad${state.units.length === 1 ? "" : "es"}.`);
      return;
    }
    if (documentData?.format === "analysis-cultural-study" && documentData.project && Array.isArray(documentData.units)) {
      sourceDocument = documentData;
      const mediaName = safe(documentData.media?.filename);
      state = {
        project: { title: safe(documentData.project.title, "Proyecto importado"), field: safe(documentData.project.field, "Estudio audiovisual"), question: safe(documentData.project.question) },
        units: documentData.units.map((unit, index) => ({
          id: safe(unit.unit_id || unit.id, `SRC-${index + 1}`), label: safe(unit.label, `Unidad ${index + 1}`),
          locator: safe(unit.locator || unit.source?.locator), modality: "video", channel: "Audiovisual",
          description: safe(unit.observation), reading: "", tags: "", mediaName,
          startSeconds: parseTime(unit.start_seconds), endSeconds: parseTime(unit.end_seconds), origin: "imported",
        })),
      };
      activeUnitId = null; syncProjectFields(); renderUnits(); persist();
      status(`Ficha audiovisual abierta: ${state.units.length} intervalo${state.units.length === 1 ? "" : "s"}. La fuente JSON queda conservada.`);
      return;
    }
    if (documentData?.schema_version === 1 && documentData.project && Array.isArray(documentData.units)) {
      sourceDocument = documentData;
      const sourceTitles = new Map((documentData.sources || []).map((source) => [source.id, source.title || source.name || ""]));
      const questions = documentData.project.questions;
      state = {
        project: {
          title: safe(documentData.name, "Proyecto importado"),
          field: safe(documentData.project.field_of_study, Array.isArray(documentData.medium) ? documentData.medium.join(", ") : safe(documentData.medium, "Proyecto importado")),
          question: Array.isArray(questions) ? questions.join("\n") : safe(questions),
        },
        units: documentData.units.map((unit, index) => {
          const annotations = unit.local_demo_annotation || {};
          const evidence = (documentData.evidence || []).filter((row) => row.unit_id === unit.id);
          return {
            id: safe(unit.id, `SRC-${index + 1}`), label: safe(unit.label || unit.name, `Unidad ${index + 1}`),
            locator: safe(unit.locator), modality: safe(unit.type, "corpus"), channel: safe(annotations.channel || unit.type),
            tags: safe(annotations.tags), description: safe(annotations.observation || evidence.map((row) => row.content).filter(Boolean).join("\n")),
            reading: safe(annotations.provisional_reading), mediaName: sourceTitles.get(unit.source_id) || "",
            startSeconds: parseTime(unit.start), endSeconds: parseTime(unit.end), origin: "imported",
          };
        }),
      };
      activeUnitId = null; syncProjectFields(); renderUnits(); persist();
      status(`Proyecto compatible abierto: ${state.units.length} unidad${state.units.length === 1 ? "" : "es"}. La fuente JSON conserva evidencia, lecturas y relaciones originales.`);
      return;
    }
    const root = documentData?.project && typeof documentData.project === "object" ? documentData.project : documentData;
    if (!root || typeof root !== "object" || Array.isArray(root)) throw new Error("El JSON no contiene una ficha o proyecto reconocible.");
    sourceDocument = documentData;
    const projectName = safe(root.title || root.name || root.project_name, "Proyecto importado");
    const projectQuestion = safe(root.question || root.research_question || root.project?.question);
    const field = safe(root.field || root.medium?.primary || root.medium?.label, "Proyecto importado");
    const imported = Array.isArray(root.units) ? root.units.map(parseImportedUnit) : [];
    state = { project: { title: projectName, field, question: projectQuestion }, units: imported };
    activeUnitId = null; syncProjectFields(); renderUnits(); persist();
    status(`Ficha abierta: ${imported.length} unidad${imported.length === 1 ? "" : "es"} de base. La fuente original se conserva para exportar.`);
  }

  syncProjectFields(); renderUnits(); renderMediaList();
  $("#load-sample").addEventListener("click", () => {
    if (!personalMediaSnapshot) personalMediaSnapshot = { mediaFiles, activeIndex, activeUnitId, objectUrls, rangeStart, rangeEnd };
    else objectUrls.forEach(URL.revokeObjectURL);
    mediaFiles = []; activeIndex = -1; activeUnitId = null; objectUrls = []; rangeStart = null; rangeEnd = null;
    $("#active-media-title").textContent = "Carga o selecciona un material"; emptyViewer();
    storageKey = sampleStorageKey;
    const sampleUnit = { id: "SAMPLE-01", label: "El filtro se pierde al volver al inicio", channel: "Interacción / uso", locator: "Escenario sintético · paso 4 de 6", tags: "continuidad, estado de interfaz", description: "Ejemplo ficticio: al abrir el mapa y volver al inicio, el filtro elegido ya no aparece.", reading: "Hipótesis por contrastar: ¿se perdió el estado o la persona esperaba otra ruta?", mediaName: "", startSeconds: null, endSeconds: null, modality: "manual", origin: "annotation", syntheticExample: true, updatedAt: new Date().toISOString() };
    state = { project: { title: "Ejemplo · recorrido de una tarea", field: "Investigación UX", question: "¿En qué paso se pierde la continuidad de una tarea?" }, units: [sampleUnit] };
    sourceDocument = null; activeUnitId = null; activeIndex = -1; rangeStart = null; rangeEnd = null;
    syncProjectFields(); renderUnits(); renderMediaList(); persist(); selectUnit(sampleUnit);
    $("#restore-workspace").hidden = false;
    status("Ejemplo ficticio listo. No representa datos de participantes ni reemplaza tu proyecto.");
    $("#unit-list").scrollIntoView?.({ behavior: "smooth", block: "center" });
  });
  $("#restore-workspace").addEventListener("click", () => {
    objectUrls.forEach(URL.revokeObjectURL);
    storageKey = personalStorageKey;
    try {
      const saved = JSON.parse(localStorage.getItem(personalStorageKey) || "null");
      state = saved?.project && Array.isArray(saved.units) ? { project: saved.project, units: saved.units } : { project: { title: "", field: "Producto / servicio", question: "" }, units: [] };
      sourceDocument = saved?.sourceDocument || null;
    } catch { state = { project: { title: "", field: "Producto / servicio", question: "" }, units: [] }; sourceDocument = null; }
    const snapshot = personalMediaSnapshot;
    mediaFiles = snapshot?.mediaFiles || []; activeIndex = -1; activeUnitId = snapshot?.activeUnitId || null; objectUrls = snapshot?.objectUrls || []; rangeStart = snapshot?.rangeStart ?? null; rangeEnd = snapshot?.rangeEnd ?? null;
    syncProjectFields(); renderUnits(); renderMediaList();
    if (snapshot?.activeIndex >= 0) selectMedia(snapshot.activeIndex);
    const selectedUnit = state.units.find((unit) => unit.id === activeUnitId);
    if (selectedUnit) selectUnit(selectedUnit);
    else { $("#annotation-label").value = ""; $("#annotation-locator").value = ""; $("#annotation-tags").value = ""; $("#annotation-description").value = ""; $("#annotation-reading").value = ""; $("#save-annotation").dataset.editId = ""; $("#save-annotation").textContent = "Guardar observación"; }
    personalMediaSnapshot = null;
    $("#restore-workspace").hidden = true;
    status("Volviste a tu espacio. El ejemplo sigue separado y no modificó este proyecto.");
    $("#first-run-title").scrollIntoView?.({ behavior: "smooth", block: "start" });
  });
  for (const selector of ["#study-title", "#study-field", "#study-question"]) $(selector).addEventListener("input", updateProject);
  $("#study-field").addEventListener("change", updateProject);
  mediaInput.addEventListener("change", (event) => {
    const incoming = [...event.target.files];
    mediaFiles.push(...incoming); renderMediaList();
    const videoIndex = mediaFiles.findIndex((file) => file.type.startsWith("video/"));
    selectMedia(videoIndex >= 0 ? videoIndex : mediaFiles.length - incoming.length);
    event.target.value = "";
  });
  importInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { importDocument(JSON.parse(await file.text())); }
    catch (error) { status(`No se pudo abrir el JSON: ${error.message}`); }
    event.target.value = "";
  });
  $("#mark-start").addEventListener("click", () => {
    const player = activePlayer(); if (!player) return;
    rangeStart = player.currentTime; rangeEnd = null; updateRangeText(); $("#annotation-label").focus();
  });
  $("#mark-end").addEventListener("click", () => {
    const player = activePlayer(); if (!player) return;
    if (rangeStart == null) { rangeStart = player.currentTime; }
    if (player.currentTime < rangeStart) { status("El final debe ser posterior al inicio. Revisa el intervalo marcado."); return; }
    rangeEnd = player.currentTime; updateRangeText();
  });
  $("#capture-frame").addEventListener("click", () => {
    const player = activePlayer(); const file = mediaFiles[activeIndex];
    if (!player || !file || !(player instanceof HTMLVideoElement)) { status("Selecciona un video para capturar un fotograma."); return; }
    if (!player.videoWidth || !player.videoHeight) { status("Espera a que el video cargue y reproduce hasta el fotograma que quieres guardar."); return; }
    const scale = Math.min(1, 1280 / player.videoWidth);
    const canvas = document.createElement("canvas"); canvas.width = Math.round(player.videoWidth * scale); canvas.height = Math.round(player.videoHeight * scale);
    canvas.getContext("2d").drawImage(player, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { status("Este video no permitió capturar el fotograma."); return; }
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${file.name.replace(/\.[^.]+$/, "")}-${timecode(player.currentTime).replace(/[:.]/g, "-")}.jpg`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (!$("#annotation-locator").value) $("#annotation-locator").value = timecode(player.currentTime);
      status("Fotograma descargado. Conserva su nombre y localizador junto al JSON exportado.");
    }, "image/jpeg", 0.82);
  });
  $("#save-annotation").addEventListener("click", () => {
    const title = $("#annotation-label").value.trim(); const description = $("#annotation-description").value.trim();
    if (!title || !description) { status("Completa el título y la descripción empírica antes de guardar."); (!title ? $("#annotation-label") : $("#annotation-description")).focus(); return; }
    const editId = $("#save-annotation").dataset.editId;
    const player = activePlayer();
    const record = { id: editId || `OBS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, label: title, channel: $("#annotation-channel").value, locator: $("#annotation-locator").value.trim(), tags: $("#annotation-tags").value.trim(), description, reading: $("#annotation-reading").value.trim(), mediaName: mediaFiles[activeIndex]?.name || "", startSeconds: rangeStart ?? (player ? player.currentTime : null), endSeconds: rangeEnd, modality: mediaFiles[activeIndex] ? mediaType(mediaFiles[activeIndex]) : "manual", origin: "annotation", updatedAt: new Date().toISOString() };
    const previousIndex = state.units.findIndex((unit) => unit.id === editId);
    if (previousIndex >= 0) state.units[previousIndex] = record; else state.units.push(record);
    activeUnitId = record.id; sourceDocument = sourceDocument || null;
    persist(); renderUnits(); $("#save-annotation").dataset.editId = record.id; $("#save-annotation").textContent = "Actualizar observación";
    status(`Observación guardada · ${record.locator || "sin localizador"}`);
  });
  $("#new-annotation").addEventListener("click", () => {
    activeUnitId = null; $("#annotation-label").value = ""; $("#annotation-locator").value = ""; $("#annotation-tags").value = "";
    $("#annotation-description").value = ""; $("#annotation-reading").value = ""; $("#save-annotation").dataset.editId = "";
    $("#save-annotation").textContent = "Guardar observación";
    const player = activePlayer(); if (player) { rangeStart = player.currentTime; rangeEnd = null; updateRangeText(); }
    renderUnits(); $("#annotation-label").focus();
  });
  $("#clear-workspace").addEventListener("click", () => {
    state = { project: { title: "", field: "Producto / servicio", question: "" }, units: [] }; sourceDocument = null;
    mediaFiles = []; activeIndex = -1; activeUnitId = null; objectUrls.forEach(URL.revokeObjectURL); objectUrls = [];
    try { localStorage.removeItem(storageKey); } catch { /* The in-memory workspace is still reset. */ }
    syncProjectFields(); renderUnits(); renderMediaList(); $("#active-media-title").textContent = "Carga o selecciona un material"; emptyViewer();
    $("#annotation-label").value = ""; $("#annotation-locator").value = ""; $("#annotation-tags").value = "";
    $("#annotation-description").value = ""; $("#annotation-reading").value = ""; $("#save-annotation").dataset.editId = ""; $("#save-annotation").textContent = "Guardar observación";
    status("Espacio local limpiado.");
  });
  $("#export-project").addEventListener("click", () => {
    updateProject();
    const output = { format: "cultural-analysis-workspace", format_version: 2, exported_at: new Date().toISOString(), project: state.project, imported_source_document: sourceDocument, units: state.units, note: "Ficha y anotaciones exportadas desde el laboratorio local. No se escribe al MCP ni contiene los archivos multimedia." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${(state.project.title || "proyecto").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto"}-corpus.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#prepare-chatgpt-export")?.addEventListener("click", () => {
    try {
      updateProject();
      const documentData = mcpImportDocument();
      const json = JSON.stringify(documentData, null, 2);
      if (new TextEncoder().encode(json).byteLength > 3_500_000) throw new Error("Este proyecto supera el límite de importación del conector. Reduce la cantidad de notas o exporta por partes.");
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${documentData.id}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(`JSON compatible descargado: ${documentData.units.length} unidades y ${documentData.evidence.length} observaciones localizadas. Adjunta el archivo en ChatGPT y usa la instrucción de importación.`);
    } catch (error) {
      status(error instanceof Error ? `No se exportó: ${error.message}` : "No se pudo preparar la importación.");
    }
  });
  $("#copy-import-prompt")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(chatImportPrompt);
      status("Instrucción de importación copiada.");
    } catch {
      status("Selecciona y copia la instrucción que aparece en este recuadro.");
    }
  });
}
