export const VAULT_SCHEMA = "academic-reversioning-vault/v1";
const MAX_DOCUMENTS = 100;
const MAX_VERSIONS = 500;
const MAX_TEXT = 2_000_000;

export function emptyVault() {
  return { schema: VAULT_SCHEMA, documents: [] };
}

function validRevision(revision) {
  return revision && typeof revision.revision_id === "string" && revision.revision_id.length > 0
    && Number.isInteger(revision.version) && revision.version > 0
    && typeof revision.created_at === "string"
    && revision.fields && typeof revision.fields === "object" && !Array.isArray(revision.fields)
    && typeof revision.markdown === "string" && revision.markdown.length <= MAX_TEXT
    && typeof revision.sha256 === "string";
}

export function parseVault(serialized) {
  if (serialized == null || serialized === "") return emptyVault();
  const value = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  if (!value || value.schema !== VAULT_SCHEMA || !Array.isArray(value.documents) || value.documents.length > MAX_DOCUMENTS)
    throw new TypeError("El archivo no tiene el formato de archivo de reversionados v1.");
  let total = 0;
  for (const document of value.documents) {
    if (!document || typeof document.document_id !== "string" || !Array.isArray(document.revisions))
      throw new TypeError("El archivo contiene un documento inválido.");
    total += document.revisions.length;
    if (document.revisions.some((revision) => !validRevision(revision)))
      throw new TypeError("El archivo contiene una versión inválida.");
  }
  if (total > MAX_VERSIONS) throw new RangeError("El archivo supera el máximo de versiones admitidas.");
  return value;
}

export function appendRevision(vaultInput, { documentId, revisionId, parentRevisionId = null, fields, markdown, createdAt, sha256 }) {
  const vault = parseVault(vaultInput);
  if (!documentId || !revisionId || !fields || typeof fields !== "object" || typeof markdown !== "string" || markdown.length > MAX_TEXT)
    throw new TypeError("Faltan datos válidos para guardar la versión.");
  const documents = vault.documents.map((document) => ({ ...document, revisions: [...document.revisions] }));
  let document = documents.find((item) => item.document_id === documentId);
  if (!document) {
    if (documents.length >= MAX_DOCUMENTS) throw new RangeError("Se alcanzó el máximo de documentos locales.");
    document = { document_id: documentId, title: String(fields.title || "Borrador sin título"), revisions: [] };
    documents.push(document);
  }
  const allRevisions = documents.flatMap((item) => item.revisions);
  if (allRevisions.length >= MAX_VERSIONS) throw new RangeError("Se alcanzó el máximo de versiones locales.");
  if (allRevisions.some((item) => item.revision_id === revisionId)) throw new TypeError("El ID de versión ya existe.");
  if (parentRevisionId && !document.revisions.some((item) => item.revision_id === parentRevisionId))
    throw new TypeError("La versión de origen no pertenece a este documento.");
  const version = Math.max(0, ...document.revisions.map((item) => item.version)) + 1;
  const revision = { revision_id: revisionId, parent_revision_id: parentRevisionId, version,
    created_at: createdAt, fields: { ...fields }, markdown, sha256 };
  if (!validRevision(revision)) throw new TypeError("La versión no cumple el esquema.");
  document.title = String(fields.title || "Borrador sin título");
  document.revisions.push(revision);
  return { schema: VAULT_SCHEMA, documents };
}

export function selectRevision(vaultInput, documentId, revisionId) {
  const vault = parseVault(vaultInput);
  const document = vault.documents.find((item) => item.document_id === documentId);
  return document?.revisions.find((item) => item.revision_id === revisionId) || null;
}

export function mergeVaults(leftInput, rightInput) {
  const left = parseVault(leftInput), right = parseVault(rightInput);
  const documents = left.documents.map((document) => ({ ...document, revisions: [...document.revisions] }));
  for (const incoming of right.documents) {
    let target = documents.find((item) => item.document_id === incoming.document_id);
    if (!target) {
      if (documents.length >= MAX_DOCUMENTS) throw new RangeError("El archivo combinado supera el máximo de documentos.");
      target = { document_id: incoming.document_id, title: incoming.title, revisions: [] };
      documents.push(target);
    }
    const known = new Map(target.revisions.map((revision) => [revision.revision_id, revision]));
    for (const revision of incoming.revisions) {
      const previous = known.get(revision.revision_id);
      if (previous) {
        // The remote D1 timestamp may differ from the browser creation timestamp.
        // Compare immutable manuscript identity, not transport/audit timestamps.
        const previousFields = previous.fields, incomingFields = revision.fields;
        const sameFields = Object.keys(previousFields).length === Object.keys(incomingFields).length
          && Object.keys(previousFields).every((key) => previousFields[key] === incomingFields[key]);
        if (previous.version !== revision.version
          || (previous.parent_revision_id || null) !== (revision.parent_revision_id || null)
          || previous.sha256 !== revision.sha256 || previous.markdown !== revision.markdown || !sameFields)
          throw new TypeError("Conflicto de integridad: un mismo ID de versión contiene datos diferentes.");
      } else {
        target.revisions.push(revision);
        known.set(revision.revision_id, revision);
      }
    }
    target.revisions.sort((a, b) => a.version - b.version || a.created_at.localeCompare(b.created_at));
    if (incoming.revisions.length) target.title = incoming.title;
  }
  const total = documents.reduce((sum, item) => sum + item.revisions.length, 0);
  if (total > MAX_VERSIONS) throw new RangeError("El archivo combinado supera el máximo de versiones.");
  return { schema: VAULT_SCHEMA, documents };
}

export function serializeVault(vaultInput) {
  return JSON.stringify(parseVault(vaultInput), null, 2);
}
