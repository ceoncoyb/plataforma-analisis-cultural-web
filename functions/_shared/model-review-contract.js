export const MODEL_REVIEW_SYNC_SCHEMA = "analysis-cultural/source-model-review-sync/v1";
export const MODEL_REVIEW_VAULT_SCHEMA = "analysis-cultural/source-model-review-vault/v1";

const EXPORT_FIELDS = new Set([
  "schema", "project_id", "project_revision", "read_only_source", "status",
  "interpretive_certification", "synced_to_cloudflare_d1", "written_to_private_mcp",
  "media_or_scans_stored", "reviews",
]);
const REVIEW_FIELDS = new Set([
  "id", "project_id", "project_revision", "source_id", "source_title", "unit_id",
  "comparison_unit_id", "evidence_id", "source_locator", "model_locator", "target_kind",
  "target_label", "operation", "claim", "limit", "status", "reviewer", "source_inspected",
  "corpus_inspected", "reviewed_at", "interpretive_certification", "model_media",
]);
const OPERATIONS = new Set([
  "narrative_state", "actantial_role", "semantic_opposition", "isotopy", "tensive_correlation",
  "visual_plastic", "sexuated_enunciative_praxis", "mythic_semiosis", "symbolic_convergence",
  "transductive_hypothesis", "semiotic_square", "other",
]);
const STATUSES = new Set(["draft", "source_checked", "evidence_checked", "ready_for_human_review"]);
const STRING_LIMITS = {
  id:200, project_id:200, source_id:200, source_title:500, unit_id:200,
  comparison_unit_id:200, evidence_id:200, source_locator:250, model_locator:250,
  target_label:160, claim:1600, limit:1600, reviewer:200,
};

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, allowed) => Object.keys(value).every((key) => allowed.has(key));
const validRevision = (value) => value === null || Number.isInteger(value) ||
  (typeof value === "string" && value.length <= 100);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

function validateReferences(references) {
  const issues = [];
  const allowed = new Set(["source_ids", "model_gate_required", "model_source_ids", "required_model_source_ids", "unit_ids", "evidence"]);
  if (!isRecord(references) || !exactKeys(references, allowed) ||
      !Array.isArray(references.source_ids) || !Array.isArray(references.unit_ids) ||
      typeof references.model_gate_required !== "boolean" || !Array.isArray(references.model_source_ids) ||
      !Array.isArray(references.required_model_source_ids) ||
      !Array.isArray(references.evidence)) {
    return { issues:["El índice efímero de referencias no cumple el contrato v1."], sources:new Set(), modelSources:new Set(), requiredModelSources:new Set(), modelGateRequired:false, units:new Set(), evidence:new Map() };
  }
  if (references.source_ids.length > 2500 || references.model_source_ids.length > 2500 || references.required_model_source_ids.length > 2500 || references.unit_ids.length > 2500 || references.evidence.length > 5000)
    issues.push("El índice de referencias supera el límite permitido.");
  const sources = new Set();
  const units = new Set();
  const evidence = new Map();
  for (const id of references.source_ids) {
    if (!nonempty(id) || id.length > 200 || sources.has(id)) issues.push("El índice contiene una fuente vacía, extensa o duplicada.");
    else sources.add(id);
  }
  const modelSources = new Set();
  for (const id of references.model_source_ids) {
    if (!nonempty(id) || id.length > 200 || modelSources.has(id) || !sources.has(id))
      issues.push("El índice de modelos contiene una fuente vacía, duplicada o ausente en la bibliografía importada.");
    else modelSources.add(id);
  }
  const requiredModelSources = new Set();
  for (const id of references.required_model_source_ids) {
    if (!nonempty(id) || id.length > 200 || requiredModelSources.has(id) || !modelSources.has(id))
      issues.push("La declaración de puerta metodológica incluye un modelo ausente o duplicado en el módulo importado.");
    else requiredModelSources.add(id);
  }
  if (references.model_gate_required && (!modelSources.size || !requiredModelSources.size || requiredModelSources.size !== references.required_model_source_ids.length))
    issues.push("La puerta metodológica requiere fuentes teóricas declaradas para el cotejo.");
  if (!references.model_gate_required && (modelSources.size || requiredModelSources.size))
    issues.push("El índice incluye modelos declarados sin una puerta metodológica activa.");
  for (const id of references.unit_ids) {
    if (!nonempty(id) || id.length > 200 || units.has(id)) issues.push("El índice contiene una unidad vacía, extensa o duplicada.");
    else units.add(id);
  }
  for (const item of references.evidence) {
    if (!isRecord(item) || !exactKeys(item, new Set(["id", "unit_id"])) ||
        !nonempty(item.id) || item.id.length > 200 || !nonempty(item.unit_id) || item.unit_id.length > 200 || evidence.has(item.id)) {
      issues.push("El índice contiene evidencia mal formada o duplicada.");
      continue;
    }
    evidence.set(item.id, item.unit_id);
  }
  for (const unitId of evidence.values()) if (!units.has(unitId)) issues.push("El índice vincula evidencia a una unidad inexistente.");
  return { issues, sources, modelSources, requiredModelSources, modelGateRequired:references.model_gate_required, units, evidence };
}

function validateReview(review, document, references, index) {
  const issues = [];
  const prefix = `Cotejo ${String(review?.id || "sin ID")}: `;
  if (!isRecord(review) || !exactKeys(review, REVIEW_FIELDS) ||
      [...REVIEW_FIELDS].some((key) => !Object.hasOwn(review, key)))
    return [prefix + "requiere los campos v1 y no admite propiedades adicionales."];
  for (const [key, limit] of Object.entries(STRING_LIMITS)) {
    if (typeof review[key] !== "string" || review[key].length > limit)
      issues.push(prefix + `el campo ${key} debe ser texto de hasta ${limit} caracteres.`);
  }
  if (!validRevision(review.project_revision) || typeof review.source_inspected !== "boolean" ||
      typeof review.corpus_inspected !== "boolean") issues.push(prefix + "los tipos del contrato no son válidos.");
  if (!nonempty(review.id) || !nonempty(review.project_id) || !nonempty(review.source_id) || !nonempty(review.unit_id))
    issues.push(prefix + "requiere IDs de cotejo, proyecto, fuente y unidad.");
  if (review.project_id !== document.project_id || review.project_revision !== document.project_revision)
    issues.push(prefix + "el proyecto o la revisión no coincide con el documento.");
  if (!index.sources.has(review.source_id)) issues.push(prefix + "la fuente no aparece en el índice del estudio importado.");
  if (index.modelGateRequired && !index.requiredModelSources.has(review.source_id))
    issues.push(prefix + "la fuente no está incluida en la puerta metodológica de figuras/tablas.");
  if (!index.units.has(review.unit_id)) issues.push(prefix + "la unidad no aparece en el índice del estudio importado.");
  if (review.comparison_unit_id && (!index.units.has(review.comparison_unit_id) || review.comparison_unit_id === review.unit_id))
    issues.push(prefix + "la unidad comparada debe existir y ser distinta de la principal.");
  if (review.evidence_id && index.evidence.get(review.evidence_id) !== review.unit_id)
    issues.push(prefix + "la evidencia no pertenece a la unidad seleccionada.");
  if (!new Set(["figure", "table", "analytic_relation"]).has(review.target_kind) || !nonempty(review.target_label))
    issues.push(prefix + "el objeto de revisión no cumple el contrato v1.");
  if (!OPERATIONS.has(review.operation) || !STATUSES.has(review.status))
    issues.push(prefix + "la operación o el estado no están admitidos.");
  if (review.status !== "draft" && (!review.source_inspected || !nonempty(review.source_locator) ||
      !nonempty(review.model_locator) || !nonempty(review.claim) || !nonempty(review.limit)))
    issues.push(prefix + "el cotejo de fuente requiere localizadores, operación y límite explícitos.");
  if (["evidence_checked", "ready_for_human_review"].includes(review.status) &&
      (!review.corpus_inspected || !review.evidence_id || index.evidence.get(review.evidence_id) !== review.unit_id))
    issues.push(prefix + "el cotejo del corpus requiere evidencia vinculada a la unidad principal.");
  if (review.status === "ready_for_human_review") {
    if (!nonempty(review.reviewer)) issues.push(prefix + "requiere una persona revisora identificada.");
    if (review.operation === "semiotic_square") issues.push(prefix + "un cuadrado semiótico requiere subpruebas separadas y no se certifica desde este registro.");
    if (["mythic_semiosis", "symbolic_convergence", "transductive_hypothesis"].includes(review.operation) && !review.comparison_unit_id)
      issues.push(prefix + "la hipótesis comparativa requiere otra unidad del corpus.");
  }
  if (typeof review.reviewed_at !== "string" || !Number.isFinite(Date.parse(review.reviewed_at)) ||
      review.interpretive_certification !== "NOT_ASSESSED" || review.model_media !== "LOCAL_PREVIEW_NOT_STORED")
    issues.push(prefix + "fecha, certificación o tratamiento de medios no cumple el contrato v1.");
  return issues;
}

export function validateModelReviewSyncRequest(value) {
  const issues = [];
  if (!isRecord(value) || !exactKeys(value, new Set(["schema", "document", "references"])))
    return { ok:false, issues:["La solicitud debe contener schema, document y references, sin otros campos."] };
  const document = value.document;
  if (!isRecord(document) || !exactKeys(document, EXPORT_FIELDS) || [...EXPORT_FIELDS].some((key) => !Object.hasOwn(document, key)))
    return { ok:false, issues:["La exportación de cotejos no cumple todos los campos requeridos por el esquema v1."] };
  if (value.schema !== "analysis-cultural/source-model-review-sync/v1" ||
      document.schema !== "analysis-cultural/source-model-reviews/v1") issues.push("La versión del contrato no está admitida.");
  if (!nonempty(document.project_id) || document.project_id.length > 200 || !validRevision(document.project_revision))
    issues.push("El ID del proyecto o su revisión no cumple los límites v1.");
  if (document.read_only_source !== true || document.status !== "pending_academic_review" ||
      document.interpretive_certification !== "NOT_ASSESSED" || document.synced_to_cloudflare_d1 !== false ||
      document.written_to_private_mcp !== false || document.media_or_scans_stored !== false)
    issues.push("La exportación debe mantener su estado local, pendiente y sin archivos multimedia.");
  const index = validateReferences(value.references);
  issues.push(...index.issues);
  if (!Array.isArray(document.reviews) || document.reviews.length > 250) {
    issues.push("La exportación admite hasta 250 cotejos.");
    return { ok:false, issues };
  }
  const ids = new Set();
  for (const review of document.reviews) {
    if (review && typeof review.id === "string") {
      if (ids.has(review.id)) issues.push(`El ID ${review.id} se repite en la exportación.`);
      ids.add(review.id);
    }
    issues.push(...validateReview(review, document, value.references, index));
  }
  return { ok:issues.length === 0, issues, project_id:document.project_id, project_revision:document.project_revision,
    reviews:Array.isArray(document.reviews) ? document.reviews : [] };
}
