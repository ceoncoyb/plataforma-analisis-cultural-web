// Read-only corpus-specific review manifest. No media bytes, uploads, AI inferences or D1 writes.
const SERIES = ["interval_analyses","vocalization_analyses","semic_analyses","narrative_analyses","discursive_analyses","postgreimasian_analyses","deep_semantic_structures"];
const asArray = (value) => Array.isArray(value) ? value : [];
const str = (value) => typeof value === "string" ? value.trim() : "";
const modality = (row) => str(row.modality).toLowerCase();
export function toSeconds(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length > 1 && parts.slice(1).some((n) => n >= 60)) return null;
  return parts.reduce((a, n) => a * 60 + n, 0);
}
export function isWithinTolerance(observed, proposed, tolerance = 0.04) {
  return Number.isFinite(observed) && Number.isFinite(proposed)
    && Number.isFinite(tolerance) && tolerance >= 0
    // Decimal timestamps such as 1.54 - 1.50 can evaluate a few ULPs above
    // 0.04 in binary floating point. Preserve the inclusive boundary.
    && Math.abs(observed - proposed) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(observed), Math.abs(proposed), tolerance) * 4;
}
export function validateCandidateDecision({ status, observed, proposed, mediaAvailable, mediaIdentity, shaRequired }) {
  if (!mediaAvailable) return { ok: false, reason: "Carga el medio local antes de revisar el candidato." };
  if (mediaIdentity === "mismatch") return { ok: false, reason: "El SHA-256 del medio no coincide con el manifiesto." };
  if (status === "confirmed" && shaRequired && mediaIdentity !== "verified")
    return { ok: false, reason: "Verifica el SHA-256 antes de confirmar." };
  if (status === "confirmed" && !isWithinTolerance(observed, proposed, 0.04))
    return { ok: false, reason: "El tiempo observado debe estar dentro de ±0,04 s del candidato." };
  return { ok: true, reason: "" };
}
export function reviewStorageKey(projectId, revision) {
  return `cultural-review:${encodeURIComponent(String(projectId))}:r${encodeURIComponent(String(revision ?? "unversioned"))}`;
}
export function loadReviewDraft(storage, projectId, revision) {
  try {
    const parsed = JSON.parse(storage.getItem(reviewStorageKey(projectId, revision)) || "null");
    if (!parsed || parsed.project_id !== String(projectId) || String(parsed.project_revision ?? "unversioned") !== String(revision ?? "unversioned"))
      return { annotations: [], cut_candidate_decisions: [] };
    return { annotations: asArray(parsed.annotations), cut_candidate_decisions: asArray(parsed.cut_candidate_decisions) };
  } catch { return { annotations: [], cut_candidate_decisions: [] }; }
}
export function saveReviewDraft(storage, projectId, revision, draft) {
  const payload = { schema: "analysis-cultural/review-draft/v1", project_id: String(projectId),
    project_revision: revision ?? null, updated_at: new Date().toISOString(),
    annotations: asArray(draft.annotations), cut_candidate_decisions: asArray(draft.cut_candidate_decisions) };
  storage.setItem(reviewStorageKey(projectId, revision), JSON.stringify(payload));
  return payload;
}
export function createReviewExport(manifest, sourceManifest, annotations, decisions) {
  return { schema: "analysis-cultural/review-annotations/v1", project_id: manifest?.project_id,
    project_revision: manifest?.revision ?? null, source_manifest: sourceManifest, read_only_source: true,
    status: "human_review_unratified", annotations: asArray(annotations), cut_candidate_decisions: asArray(decisions) };
}
export function projectExportToMultimodalReviewManifest(exported) {
  if (!exported || typeof exported !== "object") throw new TypeError("Exportación del plugin requerida");
  const project = exported.project && typeof exported.project === "object" ? exported.project : exported;
  return buildMultimodalReviewManifest(project, { revision: exported.revision ?? project.revision ?? null });
}
function compare(a,b) {
  return (a.start_seconds ?? Infinity) - (b.start_seconds ?? Infinity)
    || (a.end_seconds ?? Infinity) - (b.end_seconds ?? Infinity)
    || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}
function asTimeUnit(unit) {
  const start = unit.start ?? unit.timestamp ?? unit.time ?? unit.start_seconds ?? null;
  const end = unit.end ?? unit.end_seconds ?? start;
  return { ...unit, id: String(unit.id), label: str(unit.label) || String(unit.id),
    parent_id: str(unit.parent_id ?? unit.sequence_id) || null, type: str(unit.type),
    start, end,
    start_seconds: toSeconds(start), end_seconds: toSeconds(end),
    locator: str(unit.locator) || null };
}
function boundedEvidence(e) {
  return { ...e, id: String(e.id), unit_id: String(e.unit_id), modality: str(e.modality),
    kind: str(e.kind), locator: str(e.locator), content: str(e.content), source_id: str(e.source_id) || null };
}
function scopedUnitIds(a) { return asArray(a.unit_ids).concat(a.unit_id ? [a.unit_id] : []).map(String); }
export function buildMultimodalReviewManifest(project, { revision = null } = {}) {
  if (!project || typeof project !== "object" || !Array.isArray(project.units)) throw new TypeError("Proyecto con unidades requerido");
  revision ??= project.revision ?? null;
  const sourceUnits = asArray(project.units).filter((u) => u && u.id != null && !["cut_candidate", "candidate"].includes(str(u.type)));
  // Some corpus manifests keep subsequences and frame inventories in top-level
  // collections. Accept that shape while preserving their canonical IDs and
  // sequence_id provenance; do not silently duplicate rows already in units.
  const seenUnitIds = new Set(sourceUnits.map((u) => String(u.id)));
  const extraSegments = asArray(project.subsequences).filter((u, i, all) => u?.id != null && !seenUnitIds.has(String(u.id))
    && all.findIndex((other) => String(other?.id) === String(u.id)) === i)
    .map((u) => ({ ...u, type: u.type || "subsequence", parent_id: u.parent_id ?? u.sequence_id }));
  for (const unit of extraSegments) seenUnitIds.add(String(unit.id));
  const extraFrames = asArray(project.frames).filter((u, i, all) => u?.id != null && !seenUnitIds.has(String(u.id))
    && all.findIndex((other) => String(other?.id) === String(u.id)) === i)
    .map((u) => ({ ...u, type: u.type || "frame" }));
  sourceUnits.push(...extraSegments, ...extraFrames);
  const sequences = sourceUnits.filter((u) => u.type === "sequence").map(asTimeUnit).sort(compare);
  const intervals = sourceUnits.filter((u) => u.type === "interval").map(asTimeUnit).sort(compare);
  const rawFrames = sourceUnits.filter((u) => u.type === "frame");
  // Preserve any other time-bounded units (subsequences, scenes, shots, etc.)
  // as project-defined navigation groups instead of imposing a fixed taxonomy.
  const segments = sourceUnits.filter((u) =>
    !["sequence", "interval", "frame"].includes(str(u.type)) && u.start != null && u.end != null
  ).map(asTimeUnit).sort(compare);
  const evidenceIds = new Set();
  const evidence = asArray(project.evidence).filter((e) => e?.id && e.unit_id != null)
    .filter((e) => { const id = String(e.id); if (evidenceIds.has(id)) return false; evidenceIds.add(id); return true; })
    .map(boundedEvidence);
  const analyses = Object.fromEntries(SERIES.map((bucket) => [bucket, asArray(project[bucket])]));
  const byUnit = new Map();
  const unassigned = [];
  for (const ev of evidence) {
    if (!byUnit.has(String(ev.unit_id))) byUnit.set(String(ev.unit_id), []);
    byUnit.get(String(ev.unit_id)).push(ev);
  }
  const intervalRows = intervals.map((u) => {
    const located = analyses.interval_analyses.filter((x) => scopedUnitIds(x).includes(u.id));
    const evidenceRows = byUnit.get(u.id) || [];
    const analysis = located[0] || null;
    const linked = Object.fromEntries(SERIES.map((key) => [key, analyses[key].filter((x) => scopedUnitIds(x).includes(u.id)).map((x) => x.id)]));
    return {...u, evidence: evidenceRows,
      analysis: analysis ? {
        id: analysis.id, observable_visual: str(analysis.observable_visual), shot_scale: str(analysis.shot_scale),
        camera_angle: str(analysis.camera_angle), camera_motion: str(analysis.camera_motion),
        intraframe_motion: str(analysis.intraframe_motion), montage_operation: str(analysis.montage_operation),
        plastic: analysis.plastic || {}, spatial_configuration: str(analysis.spatial_configuration),
        sound_event: str(analysis.sound_event), lyric_lexemes: asArray(analysis.lyric_lexemes),
        intermodal_relation: analysis.intermodal_relation || null, semiotic_operation: str(analysis.semiotic_operation),
        layer_tests: analysis.layer_tests || {}, counterevidence_or_limit: str(analysis.counterevidence_or_limit)
      } : null,
      linked_analysis_ids: linked,
      channels: {
        visual: evidenceRows.filter((x) => /visual|image|image-backed|fotograf/i.test(modality(x))).length,
        sound: evidenceRows.filter((x) => /audio|sound|sonor|vocal|music/i.test(modality(x))).length,
        lyric: evidenceRows.filter((x) => /lyric|letra|text|verbal/i.test(modality(x))).length,
      }
    };
  });
  const segmentRows = segments.map((segment) => {
    const declaredParent = sequences.find((s) => String(s.id) === String(segment.parent_id));
    const containingSequences = sequences.filter((s) => segment.start_seconds != null && segment.end_seconds != null
      && s.start_seconds != null && s.end_seconds != null
      && segment.start_seconds >= s.start_seconds && segment.end_seconds <= s.end_seconds)
      .sort((a, b) => (a.end_seconds - a.start_seconds) - (b.end_seconds - b.start_seconds));
    const sequence = declaredParent || containingSequences[0] || null;
    return { ...segment, sequence_id: sequence?.id ?? null,
      hierarchy_method: declaredParent ? "declared_parent" : sequence ? "time_containment" : "unassigned",
      interval_ids: [], grouping_method: "time_containment",
      grouping_note: "Grupo temporal derivado; no modifica el parent_id declarado y conserva los campos originales." };
  });
  // Frame records from the analysis plugin may declare an interval ID in parent_id
  // while carrying their exact timestamp only in the label or locator. Normalize
  // the display hierarchy without mutating the imported project or its provenance.
  const frames = rawFrames.map((unit) => {
    const timeMatch = `${str(unit.label)} ${str(unit.locator)}`.match(/(?:^|[^0-9])(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?=$|[^0-9])/);
    const start = unit.start ?? unit.timestamp ?? unit.time ?? unit.start_seconds ?? timeMatch?.[1] ?? null;
    const end = unit.end ?? unit.end_seconds ?? start;
    const startSeconds = toSeconds(start);
    const explicitIntervalId = unit.interval_id ?? unit.interval ?? unit.unit_id ?? unit.parent_id;
    const declaredInterval = intervals.find((row) => String(row.id) === String(explicitIntervalId));
    const containingIntervals = intervals.filter((row) => startSeconds != null
      && row.start_seconds != null && row.end_seconds != null
      && startSeconds >= row.start_seconds && startSeconds <= row.end_seconds)
      .sort((a, b) => (a.end_seconds - a.start_seconds) - (b.end_seconds - b.start_seconds));
    const interval = declaredInterval || containingIntervals[0] || null;
    const explicitSequence = sequences.find((row) => String(row.id) === String(unit.sequence_id));
    const parentSequence = interval && sequences.find((row) => String(row.id) === String(interval.parent_id));
    return { ...asTimeUnit({ ...unit, start, end }),
      declared_parent_id: unit.parent_id ?? null,
      interval_id: interval?.id ?? null,
      sequence_id: explicitSequence?.id ?? parentSequence?.id ?? null,
      hierarchy_method: declaredInterval ? "declared_interval_parent"
        : interval ? "time_containment" : explicitSequence ? "declared_sequence" : "unassigned",
      start, end, start_seconds: startSeconds, end_seconds: toSeconds(end) };
  }).sort(compare);
  // In ONCOY and other canonical exports, intervals are children of sequences
  // while subsequences are peer units. Derive a single, narrowest temporal
  // group for each interval without overwriting its declared parent.
  const segmentForInterval = new Map();
  for (const interval of intervalRows) {
    const explicit = segmentRows.find((g) => String(g.id) === String(interval.parent_id));
    const declaredSequence = sequences.find((s) => String(s.id) === String(interval.parent_id));
    const eligible = segmentRows.filter((g) => (!declaredSequence || String(g.sequence_id) === String(declaredSequence.id))
      && g.start_seconds != null && g.end_seconds != null
      && interval.start_seconds != null && interval.end_seconds != null
      && interval.start_seconds >= g.start_seconds && interval.end_seconds <= g.end_seconds)
      .sort((a, b) => (a.end_seconds - a.start_seconds) - (b.end_seconds - b.start_seconds));
    const chosen = explicit || eligible[0];
    if (chosen) { chosen.interval_ids.push(interval.id); segmentForInterval.set(String(interval.id), chosen.id); }
  }
  const known = new Set(sourceUnits.map((u) => String(u.id)));
  for (const ev of evidence) if (!known.has(String(ev.unit_id))) unassigned.push(ev.id);
  const seqs = sequences.map((s) => ({
    ...s,
    segment_ids: segmentRows.filter((x) => String(x.sequence_id) === String(s.id)).map((x) => x.id),
    interval_ids: intervalRows.filter((x) => String(x.parent_id) === String(s.id)).map((x) => x.id),
    direct_interval_ids: intervalRows.filter((x) => String(x.parent_id) === String(s.id) && !segmentForInterval.has(String(x.id))).map((x) => x.id),
    evidence: byUnit.get(s.id) || [],
  }));
  const missing = intervalRows.filter((x) => !x.analysis).map((x) => x.id);
  const duration = Math.max(0,...sequences.map((s) => s.end_seconds || 0),...intervalRows.map((s) => s.end_seconds || 0));
  const cutCandidates = asArray(project.cut_candidates).filter((row) => row && row.id != null)
    .filter((row, index, all) => all.findIndex((other) => String(other.id) === String(row.id)) === index);
  return {
    schema:"analysis-cultural/multimodal-review/v1",
    project_id:String(project.id || ""), project_name:str(project.name), revision,
    medium:project.medium, method_layer_ids:asArray(project.method_profile?.layers).map((l) => typeof l === "string" ? l : l?.id).filter(Boolean),
    media_contract:{duration_seconds:duration || null, source_verified_by_client:false,
      media_bytes_in_manifest:false, local_media_file_required:true,
      expected_sources:asArray(project.sources).filter((s)=>/^sha256:[a-f0-9]{64}$/i.test(str(s.content_hash))).map((s)=>({source_id:s.id,title:str(s.title),sha256:str(s.content_hash).slice(7).toLowerCase()})),
      note:"El medio se elige localmente; cotejar duración y, cuando exista, SHA256 de origen; el MCP no inspecciona ni almacena sus bytes."},
    sequences:seqs, segments:segmentRows, intervals:intervalRows, frames,
    cut_candidates:cutCandidates,
    counts:{sequences:seqs.length,segments:segmentRows.length,intervals:intervalRows.length,frames:frames.length,
      cut_candidates:cutCandidates.length,evidence:evidence.length,
      analyses:Object.fromEntries(SERIES.map((b)=>[b,analyses[b].length]))},
    validation:{missing_interval_analysis_ids:missing, evidence_without_valid_unit_ids:unassigned,
      review_status:"OBSERVATIONS_FOR_REVIEW_NOT_INTERPRETIVE_CERTIFICATION"},
    review_policy:{all_sequences:true,all_intervals:true,channels:["visual","sonoro","lírico-verbal","plástico","montaje","intermodal","semiótico","límites"],
      evidence_from_corpus_only:true, no_automatic_sexual_or_mythic_inference:true, academic_export:"compact_synthesis_only"},
  };
}

