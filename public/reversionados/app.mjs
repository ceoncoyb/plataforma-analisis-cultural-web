import { appendRevision, emptyVault, mergeVaults, parseVault, selectRevision, serializeVault } from "/reversionados/revisions.mjs";
(() => {
 const form=document.querySelector("#article-form"), output=document.querySelector("#article-output"), status=document.querySelector("#output-status"), download=document.querySelector("#download-article"), copy=document.querySelector("#copy-article");
 const revisionSelect=document.querySelector("#revision-select"), revisionStatus=document.querySelector("#revision-status");
 const VAULT_KEY="academic-reversioning-vault-v1";
 const documentId=localStorage.getItem("academic-reversioning-document-id")||crypto.randomUUID();
 localStorage.setItem("academic-reversioning-document-id",documentId);
 let parentRevisionId=null, vault=emptyVault();
 try{vault=parseVault(localStorage.getItem(VAULT_KEY));}catch{revisionStatus.textContent="El historial local no se pudo leer. Exporta una copia si la tienes antes de continuar.";}
 const fields=["title","question","problem","method","findings","deliverables","limits"];
 const labels={title:"Título provisional",question:"Pregunta de investigación",problem:"Problema y relevancia",method:"Método y materiales",findings:"Hallazgos comprobados",deliverables:"Productos previstos",limits:"Limitaciones y verificaciones"};
 const clean=value=>value.trim()||"Pendiente de especificación; no inferido automáticamente.";
 function currentFields(){return Object.fromEntries(fields.map(key=>[key,form.elements[key].value.trim()]));}
 function currentDocument(){return vault.documents.find(item=>item.document_id===documentId)||null;}
 function renderVersions(){
   const doc=currentDocument(), revisions=doc?.revisions||[];
   revisionSelect.replaceChildren();
   if(!revisions.length){const option=document.createElement("option");option.value="";option.textContent="Todavía no hay versiones locales";revisionSelect.append(option);revisionSelect.disabled=true;return;}
   revisionSelect.disabled=false;
   for(const revision of [...revisions].reverse()){
     const option=document.createElement("option");option.value=revision.revision_id;
     option.textContent="v"+revision.version+" · "+new Date(revision.created_at).toLocaleString()+" · "+(revision.fields.title||"Sin título");
     revisionSelect.append(option);
   }
 }
 async function digest(text){
   if(!crypto.subtle)return "sha256:no-disponible";
   const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
   return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
 }
 function downloadText(filename,text,mime){
   const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);
   const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
 }
 renderVersions();
 function makeDraft(){
   const values=Object.fromEntries(fields.map(key=>[key,clean(form.elements[key].value)]));
   const today=new Date().toISOString().slice(0,10);
   return "# "+values.title+"\n\n> Estado: borrador de trabajo generado localmente el "+today+". Requiere verificación factual, metodológica y autoral antes de circular.\n\n## Resumen estructurado\n\n**Problema y relevancia.** "+values.problem+"\n\n**Pregunta.** "+values.question+"\n\n**Método y materiales.** "+values.method+"\n\n**Hallazgos.** "+values.findings+"\n\n**Productos previstos.** "+values.deliverables+"\n\n**Limitaciones y verificaciones pendientes.** "+values.limits+"\n\n## Esquema del artículo\n\n1. Introducción: problema, estado de la cuestión, vacío y pregunta.\n2. Marco conceptual: conceptos operativos y relación con la pregunta.\n3. Método: diseño, materiales, selección, procedimiento, ética y límites.\n4. Resultados: solo evidencia analizada y trazable.\n5. Discusión: interpretación, alternativas y alcance.\n6. Conclusiones: respuesta acotada, aportes y trabajo pendiente.\n7. Referencias: completar y verificar en fuentes primarias.\n\n## Control de liberación\n\n- [ ] Cotejar cada afirmación con una fuente o dato localizado.\n- [ ] Verificar referencias, citas, permisos y anonimización.\n- [ ] Registrar versión de las fuentes, plantilla y transformaciones.\n- [ ] Declarar asistencia de IA según las normas del destino editorial.\n- [ ] Revisión y aprobación autoral documentadas.\n\n## Campos de entrada\n\n"+fields.map(k=>"### "+labels[k]+"\n\n"+values[k]).join("\n\n")+"\n";
 }
 form.addEventListener("submit",event=>{event.preventDefault();output.value=makeDraft();status.textContent="Borrador generado en esta pestaña. No se ha guardado ni enviado.";download.disabled=false;copy.disabled=false;});
 document.querySelector("#clear-article").addEventListener("click",()=>{form.reset();output.value="";download.disabled=true;copy.disabled=true;parentRevisionId=null;status.textContent="Campos limpiados; las versiones guardadas se conservan.";});
 download.addEventListener("click",()=>{if(output.value)downloadText("borrador-academico-local.md",output.value,"text/markdown;charset=utf-8");});
 copy.addEventListener("click",async()=>{if(!output.value)return;await navigator.clipboard.writeText(output.value);status.textContent="Texto copiado al portapapeles de este dispositivo.";});
 document.querySelector("#save-revision").addEventListener("click",async()=>{
   try{
     const markdown=makeDraft(), fieldsNow=currentFields(), revisionId=crypto.randomUUID(), createdAt=new Date().toISOString();
     const next=appendRevision(vault,{documentId,revisionId,parentRevisionId,fields:fieldsNow,markdown,createdAt,sha256:await digest(markdown)});
     localStorage.setItem(VAULT_KEY,serializeVault(next));vault=next;parentRevisionId=revisionId;output.value=markdown;download.disabled=false;copy.disabled=false;renderVersions();revisionSelect.value=revisionId;
     revisionStatus.textContent="Versión v"+currentDocument().revisions.at(-1).version+" guardada en este navegador. Hash SHA-256: "+currentDocument().revisions.at(-1).sha256;
   }catch(error){revisionStatus.textContent="No se pudo guardar la versión local: "+error.message;}
 });
 document.querySelector("#load-revision").addEventListener("click",()=>{
   const revision=selectRevision(vault,documentId,revisionSelect.value);if(!revision)return;
   for(const key of fields)form.elements[key].value=revision.fields[key]||"";
   output.value=revision.markdown;parentRevisionId=revision.revision_id;download.disabled=false;copy.disabled=false;
   status.textContent="Versión v"+revision.version+" cargada para editar. Guardar crea una revisión nueva; no sobrescribe el historial.";
   revisionStatus.textContent="Editando desde v"+revision.version+" · "+revision.created_at;
 });
 document.querySelector("#export-vault").addEventListener("click",()=>downloadText("archivo-reversionados.json",serializeVault(vault),"application/json;charset=utf-8"));
 document.querySelector("#import-vault-button").addEventListener("click",()=>document.querySelector("#import-vault").click());
 document.querySelector("#import-vault").addEventListener("change",async event=>{
   const file=event.target.files?.[0];if(!file)return;
   try{
     const incoming=parseVault(await file.text()), combined=mergeVaults(vault,incoming);
     localStorage.setItem(VAULT_KEY,serializeVault(combined));vault=combined;renderVersions();
     revisionStatus.textContent="Historial importado y combinado sin duplicar IDs de versión. Documentos: "+vault.documents.length+".";
   }catch(error){revisionStatus.textContent="No se pudo importar el historial: "+error.message;}
   finally{event.target.value="";}
 });
 async function cloudRequest(method,body){
   const response=await fetch("/api/article-drafts",{method,credentials:"same-origin",cache:"no-store",
     headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
   const type=response.headers.get("content-type")||"";
   if(!type.includes("application/json"))throw Object.assign(new Error("Cloudflare Access requiere iniciar sesión."),{login:true});
   const payload=await response.json();
   if(!response.ok)throw Object.assign(new Error(payload.error||("Cloudflare respondió "+response.status)),{status:response.status,login:response.status===401||response.status===403});
   return payload;
 }
 document.querySelector("#sync-cloud").addEventListener("click",async event=>{
   const button=event.currentTarget, cloudStatus=document.querySelector("#cloud-status");
   if(!vault.documents.some(doc=>doc.revisions.length)){cloudStatus.textContent="No hay versiones guardadas para enviar.";return;}
   button.disabled=true;cloudStatus.textContent="Enviando versiones seleccionadas a tu archivo privado de Cloudflare…";
   try{
     let saved=0;
     for(const doc of vault.documents){
       for(const revision of [...doc.revisions].sort((a,b)=>a.version-b.version||a.created_at.localeCompare(b.created_at))){
         const result=await cloudRequest("POST",{document_id:doc.document_id,revision_id:revision.revision_id,
           parent_revision_id:revision.parent_revision_id||null,version:revision.version,
           title:String(revision.fields.title||doc.title||"Borrador sin título"),fields:revision.fields,
           markdown:revision.markdown,sha256:revision.sha256});
         if(!result.ok)throw new Error("La API no confirmó el guardado de una versión.");
         saved++;
       }
     }
     cloudStatus.textContent=saved+" versión(es) sincronizadas con D1 privada. Las fuentes originales y otros archivos no se enviaron.";
   }catch(error){
     cloudStatus.textContent=error.login?"Cloudflare Access no autorizó esta sesión. Inicia sesión y reintenta; el historial local permanece intacto.":
       "No se completó la sincronización: "+error.message+" El historial local permanece intacto.";
   }finally{button.disabled=false;}
 });
 document.querySelector("#load-cloud").addEventListener("click",async event=>{
   const button=event.currentTarget, cloudStatus=document.querySelector("#cloud-status");
   button.disabled=true;cloudStatus.textContent="Consultando el archivo privado de Cloudflare…";
   try{
     const result=await cloudRequest("GET");
     const combined=mergeVaults(vault,result.vault);
     localStorage.setItem(VAULT_KEY,serializeVault(combined));vault=combined;renderVersions();
     cloudStatus.textContent="Historial recuperado y combinado en este navegador. Documentos: "+vault.documents.length+".";
   }catch(error){
     cloudStatus.textContent=error.login?"Cloudflare Access no autorizó esta sesión. Inicia sesión y reintenta.":
       "No se pudo recuperar el historial: "+error.message;
   }finally{button.disabled=false;}
 });
})();