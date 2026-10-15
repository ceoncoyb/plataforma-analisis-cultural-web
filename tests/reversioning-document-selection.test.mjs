import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";
import { appendRevision, emptyVault, mergeVaults, parseVault, selectRevision, serializeVault } from "../public/reversionados/revisions.mjs";

test("reversioning workbench exposes an accessible document switcher and creation control", async () => {
  const html = await readFile(new URL("../public/reversionados/index.html", import.meta.url), "utf8");
  assert.match(html, /<label for="document-select">Documento activo<\/label>/);
  assert.match(html, /id="document-select" aria-label="Documento activo"/);
  assert.match(html, /id="new-document"/);
  assert.match(html, /Cambiar de documento limpia los campos de edición sin eliminar versiones/);
});

test("restoring a vault on another browser exposes its documents and preserves separate histories", async () => {
  const priorVersion = { revision_id: "remote-revision", parent_revision_id: null, version: 1,
    created_at: "2026-10-15T10:00:00Z", sha256: createHash("sha256").update("texto anterior").digest("hex"),
    markdown: "texto anterior", fields: { title: "Artículo recuperado", method: "Metodología verificada" } };
  const remoteVault = { schema: "academic-reversioning-vault/v1", documents: [
    { document_id: "from-other-browser", title: "Artículo recuperado", revisions: [priorVersion] },
  ] };
  const saved = new Map([
    ["academic-reversioning-document-id", "different-browser-document"],
    ["academic-reversioning-vault-v1", JSON.stringify(remoteVault)],
  ]);
  const nodes = new Map();
  class Element {
    constructor(id = "") { this.id=id; this.value=""; this.textContent=""; this.disabled=false; this.children=[]; this.handlers={}; }
    addEventListener(type, handler) { this.handlers[type]=handler; }
    replaceChildren(...children) { this.children=[...children]; }
    append(...children) { this.children.push(...children); }
    async fire(type) { return this.handlers[type]?.({ currentTarget: this, target: this, preventDefault() {} }); }
  }
  const form = new Element("article-form");
  const fieldNames=["title","question","problem","method","findings","deliverables","limits"];
  form.elements=Object.fromEntries(fieldNames.map((name)=>[name,new Element(name)]));
  form.reset=()=>{for(const input of Object.values(form.elements))input.value="";};
  nodes.set("#article-form",form);
  const document={
    querySelector(selector){if(!nodes.has(selector))nodes.set(selector,new Element(selector));return nodes.get(selector);},
    createElement(tag){return new Element(tag);},
  };
  const script=await readFile(new URL("../public/reversionados/app.mjs", import.meta.url),"utf8");
  const browser={
    document, localStorage:{ getItem:(key)=>saved.get(key)??null, setItem:(key,val)=>saved.set(key,val) },
    crypto:{ randomUUID:()=> "new-document-id", subtle:webcrypto.subtle },
    navigator:{clipboard:{writeText:async()=>{}}}, URL:{createObjectURL:()=>"",revokeObjectURL:()=>{}},
    Blob, Date, TextEncoder,
    appendRevision,emptyVault,mergeVaults,parseVault,selectRevision,serializeVault,
  };
  vm.runInNewContext(script.replace(/^import[^\n]*\n/,""),browser);
  const docSelect=document.querySelector("#document-select");
  const versionSelect=document.querySelector("#revision-select");
  assert.equal(saved.get("academic-reversioning-document-id"),"from-other-browser");
  assert.equal(docSelect.value,"from-other-browser");
  assert.equal(versionSelect.disabled,false);
  assert.equal(versionSelect.children.length,1);

  versionSelect.value="remote-revision";
  await document.querySelector("#load-revision").fire("click");
  assert.equal(form.elements.title.value,"Artículo recuperado");
  assert.equal(form.elements.method.value,"Metodología verificada");

  await document.querySelector("#new-document").fire("click");
  assert.equal(docSelect.value,"new-document-id");
  assert.equal(versionSelect.disabled,true);
  assert.equal(JSON.parse(saved.get("academic-reversioning-vault-v1")).documents.length,1);
  form.elements.title.value="Artículo independiente";
  await document.querySelector("#save-revision").fire("click");
  const combined=JSON.parse(saved.get("academic-reversioning-vault-v1"));
  assert.equal(combined.documents.length,2);
  assert.deepEqual(combined.documents.map((d)=>d.document_id),["from-other-browser","new-document-id"]);

  docSelect.value="from-other-browser";
  await docSelect.fire("change");
  assert.equal(versionSelect.disabled,false);
  assert.equal(saved.get("academic-reversioning-document-id"),"from-other-browser");
  versionSelect.value="remote-revision";
  await document.querySelector("#load-revision").fire("click");
  assert.equal(form.elements.title.value,"Artículo recuperado");
});
