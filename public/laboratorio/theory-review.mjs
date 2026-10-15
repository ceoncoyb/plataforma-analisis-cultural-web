// Human-led source/figure/table review for any imported study.
// Independent of Cloudflare D1 and the private ChatGPT MCP. No media or book scans persist.
const OPERATIONS = new Set([
  "narrative_state", "actantial_role", "semantic_opposition", "isotopy",
  "tensive_correlation", "visual_plastic", "sexuated_enunciative_praxis",
  "mythic_semiosis", "symbolic_convergence", "transductive_hypothesis",
  "semiotic_square", "other",
]);
const STATUSES = new Set(["draft", "source_checked", "evidence_checked", "ready_for_human_review"]);
const text = (v) => typeof v === "string" ? v.trim() : "";
const array = (v) => Array.isArray(v) ? v : [];
const select = (s) => document.querySelector(s);
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
export const modelReviewStorageKey = (id, revision) =>
  "cultural-model-review:" + encodeURIComponent(String(id)) + ":r" +
  encodeURIComponent(String(revision ?? "unversioned"));
export function loadModelReviews(storage, id, revision) {
  try {
    const doc = JSON.parse(storage.getItem(modelReviewStorageKey(id, revision)) || "null");
    if (!doc || doc.schema !== "analysis-cultural/source-model-reviews/v1" ||
        doc.project_id !== String(id) || String(doc.project_revision ?? "unversioned") !== String(revision ?? "unversioned")) return [];
    return array(doc.reviews);
  } catch { return []; }
}
export function saveModelReviews(storage, id, revision, reviews) {
  if (!Array.isArray(reviews) || reviews.length > 250) throw new Error("Se admite un máximo de 250 registros locales.");
  const doc = { schema:"analysis-cultural/source-model-reviews/v1", project_id:String(id),
    project_revision:revision ?? null, interpretive_certification:"NOT_ASSESSED",
    synced_to_cloudflare_d1:false, written_to_private_mcp:false, media_or_scans_stored:false,
    reviews };
  storage.setItem(modelReviewStorageKey(id, revision), JSON.stringify(doc));
  return doc;
}
export function validateModelReview(value, project) {
  const issues = [];
  if (!project || !Array.isArray(project.units)) return { ok:false, issues:["Importa un proyecto con unidades."] };
  const source = array(project.sources).find((x) => String(x?.id) === text(value.source_id));
  const units = new Set(project.units.map((x) => String(x?.id)));
  const evidence = array(project.evidence).find((x) => String(x?.id) === text(value.evidence_id));
  const status = text(value.status);
  const op = text(value.operation);
  const unit = text(value.unit_id);
  const second = text(value.comparison_unit_id);
  if (!source) issues.push("Selecciona una fuente registrada en el proyecto importado.");
  if (!unit || !units.has(unit)) issues.push("Selecciona una unidad existente del corpus.");
  if (second && (!units.has(second) || second === unit)) issues.push("La unidad comparada debe existir y ser distinta.");
  if (!OPERATIONS.has(op)) issues.push("Selecciona una operación metodológica admitida.");
  if (!STATUSES.has(status)) issues.push("Estado de revisión no admitido.");
  if (!text(value.target_kind) || !["figure","table","analytic_relation"].includes(value.target_kind)) issues.push("Identifica figura, tabla o relación.");
  if (!text(value.target_label) || text(value.target_label).length > 160) issues.push("Especifica el identificador de la figura o tabla (hasta 160 caracteres).");
  if (text(value.claim).length > 1600 || text(value.limit).length > 1600 ||
      text(value.source_locator).length > 250 || text(value.model_locator).length > 250) issues.push("El texto supera el límite permitido.");
  if (status !== "draft") {
    if (!value.source_inspected || !text(value.source_locator) || !text(value.model_locator))
      issues.push("La fuente debe inspeccionarse y consignar página/edición y modelo, tabla o figura.");
    if (!text(value.claim) || !text(value.limit))
      issues.push("Distingue operación observada y alternativa/límite de inferencia.");
  }
  if (status === "evidence_checked" || status === "ready_for_human_review") {
    if (!value.corpus_inspected || !evidence || String(evidence.unit_id) !== unit)
      issues.push("Coteja el corpus y vincula una evidencia que pertenezca a la unidad seleccionada.");
  }
  if (status === "ready_for_human_review") {
    if (!text(value.reviewer)) issues.push("Identifica a la persona revisora.");
    if (op === "semiotic_square") issues.push("Un cuadrado requiere probar por separado contrariedad, contradicciones e implicaciones. Este panel no certifica esas relaciones.");
    if (["transductive_hypothesis","symbolic_convergence","mythic_semiosis"].includes(op) && !second)
      issues.push("La comparación simbólica/mítica requiere otra unidad y una constelación de relaciones, no un objeto aislado.");
  }
  return { ok:!issues.length, issues };
}
// Read models only from this project's declaration. A declaration is NOT visual
// verification of the cited source. Never fabricate pages, figures or source IDs.
export function declaredModelSources(project) {
  const sourceIds = new Set(array(project?.sources).map((x) => String(x?.id)));
  const out = new Map();
  for (const module of array(project?.analysis_modules)) {
    if (!module || typeof module !== "object") continue;
    const models = [...array(module.source_models),...array(module.additional_sources)];
    if (module.source_id) models.push(module);
    for (const model of models) {
      const id = text(model?.source_id);
      if (!id || !sourceIds.has(id)) continue;
      const pages = Array.isArray(model.printed_pages)
        ? model.printed_pages.join(", ")
        : text(model.printed_pages || model.source_locator || "");
      const existing = out.get(id);
      if (!existing) out.set(id,{ source_id:id, model_name:text(model.name || model.work || module.name || ""),
        declared_locator:pages, module_id:text(module.id), status:"DECLARED_NOT_VISUALLY_VERIFIED_BY_SITE" });
      else if (!existing.declared_locator && pages) existing.declared_locator=pages;
    }
  }
  return [...out.values()].slice(0,50);
}
export function modelReviewExport(project, revision, reviews) {
  return { schema:"analysis-cultural/source-model-reviews/v1", project_id:String(project.id),
    project_revision:revision ?? null, read_only_source:true, status:"pending_academic_review",
    interpretive_certification:"NOT_ASSESSED", synced_to_cloudflare_d1:false,
    written_to_private_mcp:false, media_or_scans_stored:false, reviews:array(reviews) };
}
// Browser UI: loaded text/images remain in the tab; the generated record contains
// locators and textual observations, never private PDFs or selected media bytes.
let ctx = null;
let localUrl = null;
const field = (name) => select("[name=model-" + name + "]");
const value = (name) => field(name)?.value?.trim() || "";
const checked = (name) => Boolean(field(name)?.checked);
function status(message, error = false) {
  const el = select("#model-status");
  if (el) { el.textContent = message; el.style.color = error ? "#a6483f" : ""; }
}
function appendOptions(el, records, placeholder, previous) {
  el.replaceChildren();
  const empty = document.createElement("option");
  empty.value = ""; empty.textContent = placeholder; el.append(empty);
  for (const [id,label] of records) {
    const option = document.createElement("option");
    option.value = id; option.textContent = label; el.append(option);
  }
  if (records.some(([id]) => id === previous)) el.value = previous;
}
function refreshEvidence() {
  if (!ctx) return;
  const id = value("unit");
  const records = array(ctx.project.evidence).filter((e) => String(e?.unit_id) === id)
    .map((e) => [String(e.id),String(e.id) + " · " + String(e.locator || e.kind || "").slice(0,90)]);
  appendOptions(field("evidence"),records,"Evidencia vinculada a esta unidad",value("evidence"));
}
function renderReviews() {
  if (!ctx) return;
  const reviews = loadModelReviews(localStorage,ctx.project.id,ctx.revision);
  const el=select("#model-review-list");
  el.replaceChildren();
  if (!reviews.length) {const p=document.createElement("p");p.textContent="No hay cotejos guardados para esta revisión.";el.append(p);return;}
  for (const row of reviews) {
    const article=document.createElement("article");article.className="mm-model-record";
    article.innerHTML="<strong>"+escapeHtml(row.target_label)+" · "+escapeHtml(row.operation)+"</strong>"+
      "<p>"+escapeHtml(row.status)+" · "+escapeHtml(row.source_title)+" · "+escapeHtml(row.source_locator)+"</p>"+
      "<p>Unidad "+escapeHtml(row.unit_id)+" · evidencia "+escapeHtml(row.evidence_id || "no vinculada")+
      " · certificación interpretativa: NO EVALUADA</p>";
    el.append(article);
  }
}
function renderDeclaredModels() {
  const el=select("#model-suggestion-list");
  if (!el || !ctx) return;
  el.replaceChildren();
  const suggestions=declaredModelSources(ctx.project);
  const count=select("#model-suggestion-count");
  if(count)count.textContent=String(suggestions.length);
  const parent=select("#model-source-suggestions");
  if(parent)parent.hidden=!suggestions.length;
  for(const suggestion of suggestions) {
    const source=array(ctx.project.sources).find((x)=>String(x?.id)===suggestion.source_id);
    const row=document.createElement("div");row.className="mm-model-suggestion";
    const label=document.createElement("p");
    const sourceTitle=String(source?.title || source?.name || source?.citation || suggestion.source_id);
    label.textContent=sourceTitle+" · "+(suggestion.declared_locator || "sin localizador registrado");
    row.append(label);
    const button=document.createElement("button");
    button.type="button";button.className="button button-light button-small";
    button.textContent="Usar referencia";
    button.addEventListener("click",()=>{
      field("source").value=suggestion.source_id;
      field("locator").value=suggestion.declared_locator;
      field("model-locator").value="";
      field("source-inspected").checked=false;
      field("corpus-inspected").checked=false;
      status("Se cargó una referencia declarada. Abre la fuente y verifica su figura o tabla antes de guardar.");
      field("model-locator").focus();
    });
    row.append(button);el.append(row);
  }
}
export function mountModelReview(exported, revision) {
  const project = exported?.project?.units ? exported.project : exported;
  if (!project || !Array.isArray(project.units) || !project.id) return;
  ctx = { project,revision };
  const sources = array(project.sources).filter((s)=>s && s.id)
    .map((s)=>[String(s.id),String(s.title || s.name || s.citation || s.id).slice(0,140)]);
  const units = array(project.units).filter((u)=>u && u.id)
    .map((u)=>[String(u.id),String(u.id)+" · "+String(u.label || u.type || "").slice(0,80)]);
  appendOptions(field("source"),sources,"Fuente del proyecto (obligatoria)","");
  appendOptions(field("unit"),units,"Selecciona la unidad principal","");
  appendOptions(field("comparison"),units,"Sin comparación de unidades","");
  refreshEvidence();renderReviews();renderDeclaredModels();
  select("#model-review-panel").hidden=false;
  status(sources.length ? "Modelos y evidencias deben cotejarse manualmente. No se importa ninguna imagen de libros automáticamente."
    : "Esta exportación no contiene fuentes; añade fuentes al proyecto antes de validar modelos.",!sources.length);
}
export function suggestModelUnit(id) {
  if (!ctx || !field("unit")) return;
  if (array(ctx.project.units).some((u)=>String(u?.id) === String(id))) {
    field("unit").value=String(id);refreshEvidence();
  }
}
export function bindModelReviewUi() {
  const form=select("#model-form");
  if (!form) return;
  field("unit").addEventListener("change",refreshEvidence);
  form.addEventListener("submit",(event)=>{
    event.preventDefault();
    if (!ctx) return;
    const source=ctx.project.sources.find((s)=>String(s?.id)===value("source"));
    const review={ id:"MR-"+crypto.randomUUID(),project_id:String(ctx.project.id),project_revision:ctx.revision,
      source_id:value("source"),source_title:source?.title || source?.name || source?.citation || source?.id || "",
      unit_id:value("unit"),comparison_unit_id:value("comparison"),evidence_id:value("evidence"),
      source_locator:value("locator"),model_locator:value("model-locator"),target_kind:value("target-kind"),
      target_label:value("target-label"),operation:value("operation"),claim:value("claim"),
      limit:value("limit"),status:value("status"),reviewer:value("reviewer"),
      source_inspected:checked("source-inspected"),corpus_inspected:checked("corpus-inspected"),
      reviewed_at:new Date().toISOString(),interpretive_certification:"NOT_ASSESSED",
      model_media:"LOCAL_PREVIEW_NOT_STORED" };
    const check=validateModelReview(review,ctx.project);
    if (!check.ok) {status(check.issues.join(" "),true);return;}
    try {
      const reviews=loadModelReviews(localStorage,ctx.project.id,ctx.revision);
      reviews.push(review);saveModelReviews(localStorage,ctx.project.id,ctx.revision,reviews);
      renderReviews();status("Cotejo guardado solo en este navegador. No enviado a D1 ni al MCP privado.");
    } catch(error){status("No se pudo guardar localmente: "+error.message,true);}
  });
  select("#model-source-file").addEventListener("change",(event)=>{
    const file=event.target.files?.[0];event.target.value="";
    const preview=select("#model-local-preview");
    preview.replaceChildren();
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl=null;
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type!=="application/pdf") {
      status("Selecciona una imagen o PDF local; no se aceptan otros formatos.",true);return;
    }
    localUrl=URL.createObjectURL(file);
    const media=file.type==="application/pdf" ? document.createElement("iframe") : document.createElement("img");
    media.src=localUrl;media.title="Inspección local de fuente teórica";media.alt="Vista local de documento elegido para cotejo";
    preview.append(media);
    status("Documento abierto únicamente en esta pestaña. Su contenido no se guarda ni se transmite.");
  });
  select("#model-export").addEventListener("click",()=>{
    if(!ctx)return;
    const reviews=loadModelReviews(localStorage,ctx.project.id,ctx.revision);
    const doc=modelReviewExport(ctx.project,ctx.revision,reviews);
    const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;
    a.download="cotejos-modelos-"+String(ctx.project.id).replace(/[^a-z0-9_-]/gi,"-")+".json";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status("Cotejos exportados sin archivos multimedia ni facsímiles de libros.");
  });
}