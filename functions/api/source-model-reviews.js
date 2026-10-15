import { requireAccess, json } from "../_shared/access.js";
import { MODEL_REVIEW_VAULT_SCHEMA, validateModelReviewSyncRequest } from "../_shared/model-review-contract.js";

const MAX_BODY_BYTES = 1_500_000;
const MAX_SNAPSHOTS_PER_SCOPE = 50;
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS source_model_review_snapshots (
  user_email TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_revision TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  review_count INTEGER NOT NULL,
  reviews_json TEXT NOT NULL,
  PRIMARY KEY (user_email, project_id, project_revision, snapshot_id),
  UNIQUE (user_email, project_id, project_revision, content_sha256)
)`;

const databaseUnavailable = (env) => !env.DB || typeof env.DB.prepare !== "function";
const originMatches = (request) => request.headers.get("origin") === new URL(request.url).origin;
const validScope = (projectId, revision) => typeof projectId === "string" && projectId.trim().length > 0 && projectId.length <= 200
  && typeof revision === "string" && revision.length > 0 && revision.length <= 100;
const revisionKey = (value) => value == null ? "unversioned" : String(value);
const validSnapshotId = (value) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);

async function ensureTable(db) { await db.prepare(TABLE_SQL).run(); }
async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function databaseUnavailableResponse(env) {
  return databaseUnavailable(env) ? json({ error:"D1 binding DB is unavailable." }, 503) : null;
}
function getScope(request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id") || "";
  const revision = url.searchParams.get("revision") ?? "unversioned";
  return validScope(projectId, revision) ? { projectId, revision } : null;
}
async function readBody(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return { error:json({ error:"Send the source-model review as application/json." }, 415) };
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_BODY_BYTES) return { error:json({ error:"The source-model review exceeds the size limit." }, 413) };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
      return { error:json({ error:"The source-model review exceeds the size limit." }, 413) };
    return { input:JSON.parse(text) };
  } catch { return { error:json({ error:"Invalid JSON source-model review." }, 400) }; }
}
function vaultMetadata(scope, snapshot, reviews) {
  return {
    schema:MODEL_REVIEW_VAULT_SCHEMA,
    project_id:scope.projectId,
    project_revision:scope.revision === "unversioned" ? null : scope.revision,
    snapshot_id:snapshot.snapshot_id,
    created_at:snapshot.created_at,
    content_sha256:snapshot.content_sha256,
    review_count:Number(snapshot.review_count),
    reviews,
    interpretive_certification:"NOT_ASSESSED",
    status:"pending_academic_review",
    stored_in_cloudflare_d1:true,
    written_to_private_mcp:false,
    media_or_scans_stored:false,
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  const unavailable = databaseUnavailableResponse(env);
  if (unavailable) return unavailable;
  if (request.headers.get("origin") && !originMatches(request)) return json({ error:"Cross-origin reads are not allowed." }, 403);
  const scope = getScope(request);
  if (!scope) return json({ error:"project_id and revision are required." }, 400);
  const snapshotId = new URL(request.url).searchParams.get("snapshot_id");
  if (snapshotId && !validSnapshotId(snapshotId)) return json({ error:"snapshot_id is invalid." }, 400);
  try {
    await ensureTable(env.DB);
    if (snapshotId) {
      const row = await env.DB.prepare(
        "SELECT snapshot_id, created_at, content_sha256, review_count, reviews_json FROM source_model_review_snapshots WHERE user_email = ? AND project_id = ? AND project_revision = ? AND snapshot_id = ?",
      ).bind(auth.identity.email, scope.projectId, scope.revision, snapshotId).first();
      if (!row) return json({ error:"The requested private snapshot was not found in this project revision." }, 404);
      return json({ vault:vaultMetadata(scope, row, JSON.parse(row.reviews_json)) });
    }
    const result = await env.DB.prepare(
      "SELECT snapshot_id, created_at, content_sha256, review_count FROM source_model_review_snapshots WHERE user_email = ? AND project_id = ? AND project_revision = ? ORDER BY created_at DESC, snapshot_id DESC LIMIT ?",
    ).bind(auth.identity.email, scope.projectId, scope.revision, MAX_SNAPSHOTS_PER_SCOPE).all();
    return json({ vault:{ schema:MODEL_REVIEW_VAULT_SCHEMA, project_id:scope.projectId,
      project_revision:scope.revision === "unversioned" ? null : scope.revision,
      status:"pending_academic_review", interpretive_certification:"NOT_ASSESSED",
      written_to_private_mcp:false, media_or_scans_stored:false,
      snapshots:(result.results || []).map((row)=>({ snapshot_id:row.snapshot_id, created_at:row.created_at,
        content_sha256:row.content_sha256, review_count:Number(row.review_count) })) } });
  } catch { return json({ error:"Could not read private source-model review snapshots from D1." }, 500); }
}

export async function onRequestPost({ request, env }) {
  if (!originMatches(request)) return json({ error:"Cross-origin writes are not allowed." }, 403);
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  const unavailable = databaseUnavailableResponse(env);
  if (unavailable) return unavailable;
  const { input, error } = await readBody(request);
  if (error) return error;
  const check = validateModelReviewSyncRequest(input);
  if (!check.ok) return json({ error:"The source-model review failed server validation.", issues:check.issues.slice(0,24) }, 400);
  const scope = { projectId:check.project_id, revision:revisionKey(check.project_revision) };
  const serialized = JSON.stringify(check.reviews);
  const contentSha256 = await digest(serialized);
  try {
    await ensureTable(env.DB);
    const existing = await env.DB.prepare(
      "SELECT snapshot_id, created_at, content_sha256, review_count FROM source_model_review_snapshots WHERE user_email = ? AND project_id = ? AND project_revision = ? AND content_sha256 = ?",
    ).bind(auth.identity.email, scope.projectId, scope.revision, contentSha256).first();
    if (existing) return json({ ok:true, duplicate:true, vault:vaultMetadata(scope, existing, check.reviews) });
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM source_model_review_snapshots WHERE user_email = ? AND project_id = ? AND project_revision = ?",
    ).bind(auth.identity.email, scope.projectId, scope.revision).first();
    if ((count?.total || 0) >= MAX_SNAPSHOTS_PER_SCOPE)
      return json({ error:"This project revision has reached its private snapshot limit. Delete an older snapshot and retry." }, 413);
    const snapshot = { snapshot_id:crypto.randomUUID(), created_at:new Date().toISOString(),
      content_sha256:contentSha256, review_count:check.reviews.length };
    await env.DB.prepare(
      "INSERT INTO source_model_review_snapshots (user_email, project_id, project_revision, snapshot_id, created_at, content_sha256, review_count, reviews_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(auth.identity.email, scope.projectId, scope.revision, snapshot.snapshot_id, snapshot.created_at,
      snapshot.content_sha256, snapshot.review_count, serialized).run();
    return json({ ok:true, duplicate:false, vault:vaultMetadata(scope, snapshot, check.reviews) }, 201);
  } catch { return json({ error:"Could not save the private source-model review snapshot to D1." }, 500); }
}

export async function onRequestDelete({ request, env }) {
  if (!originMatches(request)) return json({ error:"Cross-origin writes are not allowed." }, 403);
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  const unavailable = databaseUnavailableResponse(env);
  if (unavailable) return unavailable;
  const scope = getScope(request);
  const snapshotId = new URL(request.url).searchParams.get("snapshot_id");
  if (!scope || !validSnapshotId(snapshotId)) return json({ error:"project_id, revision and snapshot_id are required." }, 400);
  try {
    await ensureTable(env.DB);
    const result = await env.DB.prepare(
      "DELETE FROM source_model_review_snapshots WHERE user_email = ? AND project_id = ? AND project_revision = ? AND snapshot_id = ?",
    ).bind(auth.identity.email, scope.projectId, scope.revision, snapshotId).run();
    return json({ ok:true, deleted:Number(result.meta?.changes || 0) > 0, project_id:scope.projectId,
      revision:scope.revision, snapshot_id:snapshotId });
  } catch { return json({ error:"Could not delete the selected source-model review snapshot from D1." }, 500); }
}
