import { sourceFigureGate } from "./theory-review.mjs";

export const MODEL_REVIEW_SYNC_SCHEMA = "analysis-cultural/source-model-review-sync/v1";
export const MODEL_REVIEW_VAULT_SCHEMA = "analysis-cultural/source-model-review-vault/v1";

export function sourceModelReviewUrl(projectId, revision, snapshotId = "") {
  const query = new URLSearchParams({ project_id:String(projectId), revision:String(revision ?? "unversioned") });
  if (snapshotId) query.set("snapshot_id", String(snapshotId));
  return "/api/source-model-reviews?" + query.toString();
}

export function createModelReviewSyncRequest(document, project) {
  const sources = Array.isArray(project?.sources) ? project.sources : [];
  const units = Array.isArray(project?.units) ? project.units : [];
  const evidence = Array.isArray(project?.evidence) ? project.evidence : [];
  const gate = sourceFigureGate(project);
  return {
    schema:MODEL_REVIEW_SYNC_SCHEMA,
    document,
    references:{
      source_ids:sources.map((item)=>String(item?.id ?? "")).filter(Boolean),
      model_gate_required:gate.required,
      model_source_ids:gate.modelSourceIds,
      required_model_source_ids:gate.requiredModelSourceIds,
      unit_ids:units.map((item)=>String(item?.id ?? "")).filter(Boolean),
      evidence:evidence.map((item)=>({ id:String(item?.id ?? ""), unit_id:String(item?.unit_id ?? "") }))
        .filter((item)=>item.id && item.unit_id),
    },
  };
}

export function validateModelReviewVault(value, projectId, revision) {
  const vault = value?.vault;
  const expectedRevision = revision ?? null;
  if (!vault || vault.schema !== MODEL_REVIEW_VAULT_SCHEMA || vault.project_id !== String(projectId) ||
      String(vault.project_revision ?? "unversioned") !== String(expectedRevision ?? "unversioned") ||
      vault.interpretive_certification !== "NOT_ASSESSED" || vault.written_to_private_mcp !== false ||
      vault.media_or_scans_stored !== false)
    throw new Error("La respuesta de D1 no coincide con el proyecto, revisión o límite de interpretación.");
  if (vault.snapshots != null && !Array.isArray(vault.snapshots)) throw new Error("La lista de snapshots de D1 no cumple el contrato.");
  if (vault.reviews != null && !Array.isArray(vault.reviews)) throw new Error("Los cotejos recuperados no cumplen el contrato.");
  return vault;
}
