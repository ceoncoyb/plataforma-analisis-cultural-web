import { requireAccess, json } from "../_shared/access.js";

const MAX_BODY_BYTES = 250_000;
const MAX_MARKDOWN_CHARS = 200_000;
const MAX_VERSIONS_PER_USER = 500;
const MAX_DOCUMENTS_PER_USER = 100;
const MAX_FIELDS = ["title", "question", "problem", "method", "findings", "deliverables", "limits"];
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS academic_article_versions (
  user_email TEXT NOT NULL,
  document_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  parent_revision_id TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  title TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  content_json TEXT NOT NULL,
  PRIMARY KEY (user_email, document_id, revision_id)
)`;

function databaseUnavailable(env) {
  return !env.DB || typeof env.DB.prepare !== "function";
}
function originMatches(request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
function validId(value, max = 160) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return false;
  return Object.keys(fields).every((key) => MAX_FIELDS.includes(key) && typeof fields[key] === "string" && fields[key].length <= 6000);
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function ensureTable(db) {
  await db.prepare(TABLE_SQL).run();
}
async function readBody(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return { error: json({ error: "Send a version as application/json." }, 415) };
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_BODY_BYTES) return { error: json({ error: "The version exceeds the size limit." }, 413) };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
      return { error: json({ error: "The version exceeds the size limit." }, 413) };
    return { input: JSON.parse(text) };
  } catch {
    return { error: json({ error: "Invalid JSON version." }, 400) };
  }
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  if (databaseUnavailable(env)) return json({ error: "D1 binding DB is unavailable." }, 503);
  try {
    await ensureTable(env.DB);
    const result = await env.DB.prepare(
      "SELECT document_id, revision_id, parent_revision_id, version, created_at, title, sha256, content_json FROM academic_article_versions WHERE user_email = ? ORDER BY document_id, version, created_at LIMIT ?",
    ).bind(auth.identity.email, MAX_VERSIONS_PER_USER).all();
    const documents = new Map();
    for (const row of result.results || []) {
      let doc = documents.get(row.document_id);
      if (!doc) {
        if (documents.size >= MAX_DOCUMENTS_PER_USER) continue;
        doc = { document_id: row.document_id, title: row.title, revisions: [] };
        documents.set(row.document_id, doc);
      }
      const content = JSON.parse(row.content_json);
      doc.title = row.title;
      doc.revisions.push({
        revision_id: row.revision_id, parent_revision_id: row.parent_revision_id,
        version: row.version, created_at: row.created_at, sha256: row.sha256,
        fields: content.fields, markdown: content.markdown,
      });
    }
    return json({ vault: { schema: "academic-reversioning-vault/v1", documents: [...documents.values()] } });
  } catch {
    return json({ error: "Could not read private academic revisions from D1." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  if (!originMatches(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
  if (databaseUnavailable(env)) return json({ error: "D1 binding DB is unavailable." }, 503);
  const { input, error } = await readBody(request);
  if (error) return error;
  const { document_id, revision_id, parent_revision_id = null, version, title, fields, markdown, sha256: suppliedHash } = input || {};
  if (!validId(document_id) || !validId(revision_id) || (parent_revision_id !== null && !validId(parent_revision_id))
      || !Number.isInteger(version) || version < 1 || version > MAX_VERSIONS_PER_USER
      || !validId(title, 240) || !validFields(fields)
      || typeof markdown !== "string" || markdown.length > MAX_MARKDOWN_CHARS
      || typeof suppliedHash !== "string" || !/^[a-f0-9]{64}$/.test(suppliedHash))
    return json({ error: "The academic revision is outside the supported schema or limits." }, 400);
  const content = JSON.stringify({ fields, markdown });
  try {
    const actualHash = await sha256(markdown);
    if (actualHash !== suppliedHash) return json({ error: "The revision hash does not match its Markdown." }, 400);
    await ensureTable(env.DB);
    const existing = await env.DB.prepare(
      "SELECT sha256, title, version, parent_revision_id, content_json FROM academic_article_versions WHERE user_email = ? AND document_id = ? AND revision_id = ?",
    ).bind(auth.identity.email, document_id, revision_id).first();
    if (existing) {
      // A revision ID identifies the entire immutable snapshot, not only its Markdown digest.
      // The Markdown SHA-256 alone would permit silent changes to title, fields or ancestry.
      const stored = JSON.parse(existing.content_json);
      const storedFields = stored?.fields;
      const sameFields = storedFields && typeof storedFields === "object" && !Array.isArray(storedFields)
        && Object.keys(storedFields).length === Object.keys(fields).length
        && Object.keys(fields).every((key) => storedFields[key] === fields[key]);
      const unchanged = existing.sha256 === suppliedHash
        && existing.title === title && Number(existing.version) === version
        && (existing.parent_revision_id || null) === parent_revision_id
        && stored?.markdown === markdown && sameFields;
      if (!unchanged) return json({ error: "This revision ID already exists with different content or metadata." }, 409);
      return json({ ok: true, duplicate: true, document_id, revision_id, sha256: suppliedHash });
    }
    if (parent_revision_id) {
      const parent = await env.DB.prepare(
        "SELECT revision_id FROM academic_article_versions WHERE user_email = ? AND document_id = ? AND revision_id = ?",
      ).bind(auth.identity.email, document_id, parent_revision_id).first();
      if (!parent) return json({ error: "The parent revision was not found in this private document." }, 409);
    }
    // The read API caps visible documents at MAX_DOCUMENTS_PER_USER.
    // Refuse to persist additional document IDs that would silently disappear on recovery.
    const documents = await env.DB.prepare(
      "SELECT COUNT(DISTINCT document_id) AS total, MAX(CASE WHEN document_id = ? THEN 1 ELSE 0 END) AS already_present FROM academic_article_versions WHERE user_email = ?",
    ).bind(document_id, auth.identity.email).first();
    if (Number(documents?.total || 0) >= MAX_DOCUMENTS_PER_USER && !documents?.already_present)
      return json({ error: "The private archive has reached its document limit." }, 413);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM academic_article_versions WHERE user_email = ?",
    ).bind(auth.identity.email).first();
    if ((count?.total || 0) >= MAX_VERSIONS_PER_USER)
      return json({ error: "The private archive has reached its version limit." }, 413);
    const createdAt = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO academic_article_versions (user_email, document_id, revision_id, parent_revision_id, version, created_at, title, sha256, content_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(auth.identity.email, document_id, revision_id, parent_revision_id, version, createdAt, title, suppliedHash, content).run();
    return json({ ok: true, duplicate: false, document_id, revision_id, created_at: createdAt, sha256: suppliedHash }, 201);
  } catch {
    return json({ error: "Could not save the private academic revision to D1." }, 500);
  }
}
