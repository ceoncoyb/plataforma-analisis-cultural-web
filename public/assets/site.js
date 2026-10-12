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
  const storageKey = "cultural-corpus-lab-v2";
  const $ = (selector) => document.querySelector(selector);
  const videoTransport = $("#video-transport");
  const mediaStage = $("#media-stage");
  const importInput = $("#import-project");
  const mediaInput = $("#media-files");
  let state = { project: { title: "", field: "Producto / servicio", question: "" }, units: [] };
  let sourceDocument = null;
  let mediaFiles = [];
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
}
