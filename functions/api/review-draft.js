import { requireAccess, json } from "../_shared/access.js";

const MAX_BODY_BYTES = 220_000;
const MAX_ROWS = 500;
const EMPTY_DRAFT = { annotations: [], cut_candidate_decisions: [] };
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS lab_review_drafts (
  user_email TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_revision TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  PRIMARY KEY (user_email, project_id, project_revision)
)`;

function validScope(projectId, revision) {
  return typeof projectId === "string" && projectId.trim().length > 0 && projectId.length <= 160
    && typeof revision === "string" && revision.length <= 100;
}

function scopedUrl(request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id") || "";
  const revision = url.searchParams.get("revision") ?? "unversioned";
  return validScope(projectId, revision) ? { projectId, revision } : null;
}

async function ensureTable(db) {
  await db.prepare(TABLE_SQL).run();
}

function databaseUnavailable(env) {
  return !env.DB || typeof env.DB.prepare !== "function";
}

function originMatches(request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  if (databaseUnavailable(env)) return json({ error: "D1 binding DB is unavailable." }, 503);
  const scope = scopedUrl(request);
  if (!scope) return json({ error: "project_id and revision are required." }, 400);
  try {
    await ensureTable(env.DB);
    const row = await env.DB.prepare(
      "SELECT draft_json, updated_at FROM lab_review_drafts WHERE user_email = ? AND project_id = ? AND project_revision = ?",
    ).bind(auth.identity.email, scope.projectId, scope.revision).first();
    return json({ draft: row ? JSON.parse(row.draft_json) : EMPTY_DRAFT, updated_at: row?.updated_at || null });
  } catch {
    return json({ error: "Could not read the review draft from D1." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  if (!originMatches(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
  if (databaseUnavailable(env)) return json({ error: "D1 binding DB is unavailable." }, 503);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return json({ error: "Send the review draft as application/json." }, 415);
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_BODY_BYTES) return json({ error: "The review draft exceeds the size limit." }, 413);
  let input;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return json({ error: "The review draft exceeds the size limit." }, 413);
    input = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON review draft." }, 400);
  }
  const projectId = input?.project_id;
  const revision = input?.project_revision == null ? "unversioned" : String(input.project_revision);
  const annotations = input?.annotations;
  const decisions = input?.cut_candidate_decisions;
  if (!validScope(projectId, revision) || !Array.isArray(annotations) || !Array.isArray(decisions)
      || annotations.length > MAX_ROWS || decisions.length > MAX_ROWS)
    return json({ error: "Review draft is outside the supported project scope or row limits." }, 400);
  if (decisions.some((row) => !row || typeof row.candidate_id !== "string"
      || !["confirmed", "false_positive", "doubtful"].includes(row.status)))
    return json({ error: "Every saved decision needs a candidate ID and a valid human status." }, 400);
  const updatedAt = new Date().toISOString();
  const draft = { schema: "analysis-cultural/review-draft/v1", project_id: projectId,
    project_revision: input.project_revision ?? null, updated_at: updatedAt, annotations, cut_candidate_decisions: decisions };
  const serialized = JSON.stringify(draft);
  try {
    await ensureTable(env.DB);
    await env.DB.prepare(`INSERT INTO lab_review_drafts (user_email, project_id, project_revision, updated_at, draft_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_email, project_id, project_revision) DO UPDATE SET
        updated_at = excluded.updated_at, draft_json = excluded.draft_json`)
      .bind(auth.identity.email, projectId, revision, updatedAt, serialized).run();
    return json({ ok: true, updated_at: updatedAt, project_id: projectId, project_revision: input.project_revision ?? null });
  } catch {
    return json({ error: "Could not save the review draft to D1." }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  if (!originMatches(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
  if (databaseUnavailable(env)) return json({ error: "D1 binding DB is unavailable." }, 503);
  const scope = scopedUrl(request);
  if (!scope) return json({ error: "project_id and revision are required." }, 400);
  try {
    await ensureTable(env.DB);
    await env.DB.prepare("DELETE FROM lab_review_drafts WHERE user_email = ? AND project_id = ? AND project_revision = ?")
      .bind(auth.identity.email, scope.projectId, scope.revision).run();
    return json({ ok: true, deleted: true, project_id: scope.projectId, revision: scope.revision });
  } catch {
    return json({ error: "Could not delete the review draft from D1." }, 500);
  }
}
