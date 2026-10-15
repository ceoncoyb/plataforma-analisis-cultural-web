import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { onRequestGet, onRequestPost } from "../functions/api/article-drafts.js";
import { mergeVaults } from "../public/reversionados/revisions.mjs";

const issuer = "https://integrity-tests.cloudflareaccess.com";
const allowedEmail = "writer@example.test";
const envBase = { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: "article-integrity-test", CF_ACCESS_ALLOWED_EMAILS: allowedEmail };

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "article-integrity-key", alg: "RS256", use: "sig" };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = encode({
    iss: issuer, aud: envBase.CF_ACCESS_AUD, email: allowedEmail,
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const header = encode({ alg: "RS256", kid: jwk.kid });
  const unsigned = header + "." + claims;
  const jwt = unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  return { jwk, jwt };
}

const sharedFixture = fixture();

function fakeDb(preloadDocuments = 0) {
  const rows = new Map(), calls = [];
  const key = (user, doc, revision) => JSON.stringify([user, doc, revision]);
  for (let i = 0; i < preloadDocuments; i++) {
    const doc = "existing-" + i;
    rows.set(key(allowedEmail, doc, "revision-1"), {
      user_email: allowedEmail, document_id: doc, revision_id: "revision-1",
      parent_revision_id: null, version: 1, created_at: "2026-10-15T00:00:00Z",
      title: "Seed", sha256: "synthetic", content_json: JSON.stringify({ fields: {}, markdown: "" }),
    });
  }
  return { rows, calls, prepare(sql) {
    const statement = {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        calls.push(sql);
        if (sql.startsWith("SELECT sha256, title, version")) return rows.get(key(...this.values)) || null;
        if (sql.startsWith("SELECT revision_id FROM")) {
          const row = rows.get(key(...this.values));
          return row ? { revision_id: row.revision_id } : null;
        }
        if (sql.startsWith("SELECT COUNT(DISTINCT")) {
          const [docId, user] = this.values;
          const matching = [...rows.values()].filter((row) => row.user_email === user);
          return {
            total: new Set(matching.map((row) => row.document_id)).size,
            already_present: matching.some((row) => row.document_id === docId) ? 1 : 0,
          };
        }
        if (sql.startsWith("SELECT COUNT(*)")) {
          return { total: [...rows.values()].filter((row) => row.user_email === this.values[0]).length };
        }
        throw new Error("Unexpected SELECT: " + sql);
      },
      async all() {
        calls.push(sql);
        if (!sql.startsWith("SELECT document_id, revision_id")) throw new Error("Unexpected listing query");
        return { results: [...rows.values()].filter((row) => row.user_email === this.values[0])
          .map(({ user_email, ...row }) => row) };
      },
      async run() {
        calls.push(sql);
        if (sql.startsWith("INSERT INTO academic_article_versions")) {
          const [user_email, document_id, revision_id, parent_revision_id,
            version, created_at, title, sha256, content_json] = this.values;
          rows.set(key(user_email, document_id, revision_id), {
            user_email, document_id, revision_id, parent_revision_id,
            version, created_at, title, sha256, content_json,
          });
        }
        return { success: true };
      },
    };
    return statement;
  }};
}

function payload(overrides = {}) {
  const markdown = "# Integridad de revisiones\n\nEjemplo sintético.";
  return {
    document_id: "scientific-note", revision_id: "r1", parent_revision_id: null,
    version: 1, title: "Nota científica", fields: { title: "Nota científica", method: "Caso sintético" },
    markdown, sha256: createHash("sha256").update(markdown).digest("hex"), ...overrides,
  };
}

function post(body, jwt) {
  return new Request("https://pages.example/api/article-drafts", {
    method: "POST", headers: {
      origin: "https://pages.example", "content-type": "application/json",
      "cf-access-jwt-assertion": jwt,
    },
    body: JSON.stringify(body),
  });
}

test("remote revision IDs are immutable across Markdown, fields, title, parent and version", async () => {
  const { jwk, jwt } = sharedFixture;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  try {
    const db = fakeDb(), env = { ...envBase, DB: db };
    const version = payload();
    let response = await onRequestPost({ request: post(version, jwt), env });
    assert.equal(response.status, 201);
    response = await onRequestPost({ request: post(version, jwt), env });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).duplicate, true);
    const changes = [
      { fields: { ...version.fields, method: "Evidencia alterada" } },
      { title: "Título alterado" },
      { version: 2 },
      { parent_revision_id: "another-ancestor" },
      { markdown: version.markdown + " cambio" },
    ];
    for (const change of changes) {
      response = await onRequestPost({ request: post({ ...version, ...change }, jwt), env });
      assert.equal(response.status, change.markdown ? 400 : 409, "changed property: " + Object.keys(change)[0]);
    }
    response = await onRequestGet({ request: new Request("https://pages.example/api/article-drafts", {
      headers: { "cf-access-jwt-assertion": jwt },
    }), env });
    assert.equal(response.status, 200);
    const recovered = (await response.json()).vault.documents[0].revisions[0];
    assert.deepEqual(recovered.fields, version.fields);
    assert.equal(recovered.markdown, version.markdown);
    assert.equal(db.rows.size, 1, "mutations must not create further rows");
  } finally { globalThis.fetch = originalFetch; }
});

test("document cap prevents creating invisible cloud documents but permits further versions of existing ones", async () => {
  const { jwk, jwt } = sharedFixture;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  try {
    const db = fakeDb(100), env = { ...envBase, DB: db };
    let response = await onRequestPost({ request: post(payload(), jwt), env });
    assert.equal(response.status, 413);
    assert.equal(db.rows.size, 100);
    response = await onRequestPost({ request: post(payload({
      document_id: "existing-0", revision_id: "revision-2", version: 2,
      parent_revision_id: "revision-1",
    }), jwt), env });
    assert.equal(response.status, 201);
    assert.equal(db.rows.size, 101);
  } finally { globalThis.fetch = originalFetch; }
});

test("local import accepts timestamp-only differences and refuses conflicts under an existing revision ID", () => {
  const version = {
    revision_id: "r1", parent_revision_id: null, version: 1,
    created_at: "2026-10-15T08:00:00Z", fields: { title: "Borrador", method: "Evidencia cotejada" },
    markdown: "contenido original", sha256: "hash-de-ejemplo",
  };
  const vault = {
    schema: "academic-reversioning-vault/v1",
    documents: [{ document_id: "documento", title: "Borrador", revisions: [version] }],
  };
  const imported = structuredClone(vault);
  imported.documents[0].revisions[0].created_at = "2026-10-15T09:00:00Z";
  assert.equal(mergeVaults(vault, imported).documents[0].revisions.length, 1);
  imported.documents[0].revisions[0].fields.method = "Interpretación manipulada";
  assert.throws(() => mergeVaults(vault, imported), /Conflicto de integridad/);
  assert.equal(vault.documents[0].revisions[0].fields.method, "Evidencia cotejada");
});
