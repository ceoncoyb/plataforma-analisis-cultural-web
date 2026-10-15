// Local-only, author-led L10 review. It records traceable proposals; it never
// turns structural coverage into interpretive certification or writes to D1/MCP.
const asArray=(value)=>Array.isArray(value)?value:[];
const text=(value)=>typeof value==="string"?value.trim():"";
const GRADES=new Set(["SUPPORTED","PLAUSIBLE/INFERENCE","SPECULATIVE/OPEN"]);
const DECISIONS=new Set(["pending","accepted","rejected"]);
const OPERATIONS=new Set(["analogy","homology","transduction","cultural_abduction","tensive_correlation","other"]);
const isDate=(value)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+"T00:00:00.000Z").toISOString().slice(0,10)===value;

export const hermeneuticStorageKey=(id,revision)=>"cultural-hermeneutic-review:"+encodeURIComponent(String(id))+":r"+encodeURIComponent(String(revision??"unversioned"));

export function loadHermeneuticReviews(storage,id,revision){
  try{
    const doc=JSON.parse(storage.getItem(hermeneuticStorageKey(id,revision))||"null");
    if(doc?.schema!=="analysis-cultural/hermeneutic-reviews/v1"||doc.project_id!==String(id)||String(doc.project_revision??"unversioned")!==String(revision??"unversioned"))return[];
    return asArray(doc.reviews);
  }catch{return[];}
}

export function saveHermeneuticReviews(storage,id,revision,reviews){
  if(!Array.isArray(reviews)||reviews.length>250)throw new Error("Se admite un máximo de 250 propuestas hermenéuticas locales.");
  const doc={schema:"analysis-cultural/hermeneutic-reviews/v1",project_id:String(id),project_revision:revision??null,
    status:"pending_authorial_review",interpretive_certification:"NOT_ASSESSED",synced_to_cloudflare_d1:false,
    written_to_private_mcp:false,media_or_scans_stored:false,reviews};
  storage.setItem(hermeneuticStorageKey(id,revision),JSON.stringify(doc));
  return doc;
}

export function hermeneuticCorpus(project){
  const contract=project?.method_profile?.postsemiotic_hermeneutic_contract;
  const allowed=new Map(asArray(contract?.object_corpus?.theory_corpus).map((row)=>[text(row?.source_id),row]).filter(([id])=>id));
  return asArray(project?.sources).filter((source)=>allowed.has(String(source?.id))).map((source)=>({
    id:String(source.id),title:text(source.title||source.name||source.citation||source.id),
    role:text(allowed.get(String(source.id))?.role),
    consulted_extent_status:text(allowed.get(String(source.id))?.consulted_extent_status)||"pending",
  }));
}

export function hermeneuticBases(project){
  return asArray(project?.readings).filter((reading)=>[
    "L8_internal_semiotic_synthesis","L9_archetypal_functional_contrast",
  ].includes(text(reading?.layer))).map((reading)=>({id:String(reading.id),layer:reading.layer,claim:text(reading.claim),status:text(reading.status)}));
}

export function legacyHermeneuticReadings(project){
  return asArray(project?.readings).filter((reading)=>text(reading?.layer)==="L10_controlled_hermeneutics");
}

export function validateHermeneuticReview(value,project){
  const issues=[];
  if(!project||!Array.isArray(project.units))return{ok:false,issues:["Importa un proyecto con unidades."]};
  const units=new Set(project.units.filter((x)=>x?.id!=null).map((x)=>String(x.id)));
  const evidence=new Map(asArray(project.evidence).filter((x)=>x?.id!=null).map((x)=>[String(x.id),x]));
  const allowedSources=new Map(hermeneuticCorpus(project).map((x)=>[x.id,x]));
  const bases=new Map(hermeneuticBases(project).map((x)=>[x.id,x]));
  const grade=text(value?.epistemic_grade),decision=text(value?.author_decision),sourceId=text(value?.theory_source_id);
  const unitIds=[...new Set(asArray(value?.supporting_unit_ids).map(String))];
  const evidenceIds=[...new Set(asArray(value?.evidence_ids).map(String))];
  if(!text(value?.interpretive_question))issues.push("Formula la pregunta interpretativa.");
  if(!text(value?.claim))issues.push("Formula la hipótesis interpretativa.");
  if(!GRADES.has(grade))issues.push("Selecciona un grado epistémico admitido.");
  if(!OPERATIONS.has(text(value?.semiotic_operation)))issues.push("Selecciona la operación de mapeo semiótico.");
  const l8=bases.get(text(value?.L8_synthesis_id));
  if(!l8||l8.layer!=="L8_internal_semiotic_synthesis")issues.push("Vincula una síntesis intratextual L8 existente antes de interpretar.");
  else if(!["accepted","accepted_with_changes","accepted_with_conditions"].includes(l8.status))issues.push("La síntesis L8 debe tener aceptación humana registrada antes de abrir la instancia L10.");
  const l9=value?.L9_contrast_id?bases.get(text(value.L9_contrast_id)):null;
  if(value?.L9_contrast_id&&!l9)issues.push("El contraste L9 seleccionado no existe en el proyecto.");
  else if(l9&&!['accepted','accepted_with_changes','accepted_with_conditions'].includes(l9.status))issues.push("El contraste L9 requiere aceptación humana registrada antes de usarse como base interpretativa.");
  if(!allowedSources.has(sourceId))issues.push("Selecciona una fuente del corpus teórico postsemiótico declarado en el proyecto.");
  const declaredExtent=allowedSources.get(sourceId)?.consulted_extent_status||"pending";
  const extent=text(value?.consulted_extent_status);
  const extentRank={pending:0,metadata_only:1,abstract_only:2,specific_pages_verified:3,full_text_verified:4};
  if(!Object.hasOwn(extentRank,declaredExtent))issues.push("El perfil de la fuente necesita un estado documental reconocido antes de validar L10.");
  if(Object.hasOwn(extentRank,extent)&&extentRank[extent]>extentRank[declaredExtent])
    issues.push("El perfil de fuentes declara una consulta menos extensa; coteja y actualiza primero ese estado para usar un nivel superior.");
  if(!unitIds.length||unitIds.some((id)=>!units.has(id)))issues.push("Vincula una o más unidades existentes del corpus.");
  if(!evidenceIds.length||evidenceIds.some((id)=>!evidence.has(id)))issues.push("Vincula evidencias existentes del proyecto.");
  if(evidenceIds.some((id)=>!unitIds.includes(String(evidence.get(id)?.unit_id))))issues.push("Cada evidencia debe pertenecer a una de las unidades seleccionadas.");
  if(!text(value?.edition_and_page_or_section))issues.push("Registra edición y página o sección consultada.");
  if(!["full_text_verified","specific_pages_verified","abstract_only","metadata_only","pending"].includes(extent))issues.push("Indica qué extensión de la fuente se consultó.");
  if(["full_text_verified","specific_pages_verified"].includes(extent)&&!value?.source_inspected)issues.push("Marca la inspección directa para declarar cotejo de texto o páginas.");
  if(!text(value?.mapping_steps))issues.push("Explicita cómo se relaciona el concepto teórico con las operaciones del corpus.");
  if(!text(value?.alternative_reading))issues.push("Registra al menos una lectura alternativa.");
  if(!text(value?.counterevidence))issues.push("Registra la contraevidencia revisada o el límite de esa búsqueda.");
  if(!text(value?.scope_limit))issues.push("Delimita el alcance de la hipótesis.");
  if(grade==="SUPPORTED"){
    if(unitIds.length<2)issues.push("SUPPORTED exige apoyos semióticos localizados en al menos dos unidades.");
    if(evidenceIds.length<2)issues.push("SUPPORTED exige al menos dos evidencias trazables.");
    if(!["full_text_verified","specific_pages_verified"].includes(extent))issues.push("SUPPORTED exige cotejo directo de texto o páginas; el resumen y los metadatos solo orientan.");
  }
  if(!DECISIONS.has(decision))issues.push("La decisión autoral no es válida.");
  if(decision!=="pending"&&(!text(value?.human_decider)||!isDate(value?.decision_date)))issues.push("Una decisión autoral requiere identidad de quien decide y una fecha válida.");
  if(!["draft","ready_for_author_decision","decision_recorded"].includes(text(value?.status)))issues.push("El estado del registro no es válido.");
  if(text(value?.status)==="ready_for_author_decision"&&decision!=="pending")issues.push("El estado listo para decisión debe conservar la decisión pendiente.");
  if(text(value?.status)==="decision_recorded"&&decision==="pending")issues.push("El estado de decisión registrada requiere aceptación o descarte autoral.");
  if(decision!=="pending"&&text(value?.status)!=="decision_recorded")issues.push("Registra el estado de decisión autoral para aceptar o descartar la propuesta.");
  if(grade==="SPECULATIVE/OPEN"&&value?.manuscript_claim_kind==="factual_results")issues.push("Una hipótesis especulativa no se presenta como hallazgo fáctico en Resultados.");
  return{ok:!issues.length,issues};
}

export function hermeneuticReviewExport(project,revision,reviews){
  return{schema:"analysis-cultural/hermeneutic-reviews/v1",project_id:String(project.id),project_revision:revision??null,
    read_only_source:true,status:"pending_authorial_review",interpretive_certification:"NOT_ASSESSED",
    synced_to_cloudflare_d1:false,written_to_private_mcp:false,media_or_scans_stored:false,reviews:asArray(reviews)};
}

let ctx=null;
const select=(s)=>document.querySelector(s);
const field=(name)=>select("[name=herm-"+name+"]");
const val=(name)=>field(name)?.value?.trim()||"";
const checked=(name)=>Boolean(field(name)?.checked);
const escapeHtml=(v)=>String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
function status(message,error=false){const el=select("#herm-status");if(el){el.textContent=message;el.style.color=error?"#a6483f":"";}}
function fill(el,rows,placeholder){if(!el)return;el.replaceChildren();const o=document.createElement("option");o.value="";o.textContent=placeholder;el.append(o);for(const row of rows){const op=document.createElement("option");op.value=row.id;op.textContent=row.label;el.append(op);}}
function chosen(name){return [...(field(name)?.selectedOptions||[])].map((x)=>x.value).filter(Boolean);}
function renderLegacy(){
 const el=select("#herm-legacy-list");if(!el||!ctx)return;el.replaceChildren();
 const rows=legacyHermeneuticReadings(ctx.project);
 if(!rows.length){el.textContent="No hay lecturas L10 previas en esta exportación.";return;}
 for(const row of rows){const article=document.createElement("article");article.className="mm-model-record";
  const title=document.createElement("strong");title.textContent=(row.concept||row.id)+" · "+(row.status||"sin estado");article.append(title);
  const claim=document.createElement("p");claim.textContent=row.claim||"Lectura heredada sin formulación registrada.";article.append(claim);
  const trace=document.createElement("p");trace.textContent=`Registro heredado ${row.id} · evidencias positivas ${asArray(row.evidence_positive).length} · contraevidencias ${asArray(row.evidence_adverse).length} · requiere revalidación individual; el importador no modifica su estado.`;article.append(trace);el.append(article);
 }
}
function renderRows(){
 if(!ctx)return;const el=select("#herm-review-list");el.replaceChildren();const rows=loadHermeneuticReviews(localStorage,ctx.project.id,ctx.revision);
 if(!rows.length){el.textContent="No hay propuestas hermenéuticas locales para esta revisión.";return;}
 for(const row of rows){const article=document.createElement("article");article.className="mm-model-record";const title=document.createElement("strong");title.textContent=`${row.epistemic_grade} · ${row.author_decision}`;article.append(title);const claim=document.createElement("p");claim.textContent=row.claim;article.append(claim);const meta=document.createElement("p");meta.textContent=`L8 ${row.L8_synthesis_id} · fuente ${row.theory_source_id} · unidades ${asArray(row.supporting_unit_ids).join(", ")} · certificación: NO EVALUADA`;article.append(meta);el.append(article);}
}
export function mountHermeneuticReview(exported,revision){
 const project=exported?.project?.units?exported.project:exported;if(!project||!Array.isArray(project.units)||!project.id)return;
 ctx={project,revision};const panel=select("#herm-review-panel");if(!panel)return;
  const sourceRows=hermeneuticCorpus(project);const sources=sourceRows.map((x)=>({id:x.id,label:`${x.title} · ${x.consulted_extent_status}`}));
 const bases=hermeneuticBases(project);const syntheses=bases.filter((x)=>x.layer==="L8_internal_semiotic_synthesis").map((x)=>({id:x.id,label:`${x.id} · L8 · ${x.claim.slice(0,90)}`}));
 const contrasts=bases.filter((x)=>x.layer==="L9_archetypal_functional_contrast").map((x)=>({id:x.id,label:`${x.id} · L9 · ${x.claim.slice(0,90)}`}));
 fill(field("source"),sources,"Fuente permitida por el corpus hermenéutico");fill(field("l8"),syntheses,"Selecciona una síntesis L8 existente");fill(field("l9"),contrasts,"Sin contraste L9");
  field("source")?.addEventListener("change",()=>{const source=sourceRows.find((x)=>x.id===val("source"));if(source&&field("extent"))field("extent").value=source.consulted_extent_status;
    const note=select("#herm-source-guidance");if(note)note.textContent=source?[source.role,source.consulted_extent_status,asArray(project.method_profile?.postsemiotic_hermeneutic_contract?.object_corpus?.theory_corpus?.find((x)=>String(x.source_id)===source.id)?.verified_locators).length?"Localizadores verificados: "+asArray(project.method_profile.postsemiotic_hermeneutic_contract.object_corpus.theory_corpus.find((x)=>String(x.source_id)===source.id).verified_locators).join("; "):"Sin localizadores teóricos específicos verificados en el perfil."].filter(Boolean).join(" · "):"Selecciona una fuente; se mostrará su función y estado documental declarados.";
  });
 for(const name of ["units","evidence"]){const el=field(name);if(!el)continue;el.replaceChildren();for(const row of name==="units"?project.units:asArray(project.evidence)){if(row?.id==null)continue;const option=document.createElement("option");option.value=String(row.id);option.textContent=name==="units"?`${row.id} · ${row.label||row.type||"unidad"}`:`${row.id} · unidad ${row.unit_id} · ${row.locator||row.kind||"evidencia"}`;el.append(option);}}
 panel.hidden=false;renderLegacy();renderRows();
 status(sources.length&&syntheses.length?"Instancia L10 delimitada: posterior a L8/L9, humana y local. Las lecturas heredadas permanecen pendientes de revalidación.":"La exportación no contiene aún fuente teórica L10 o síntesis L8 seleccionable; la fase queda bloqueada hasta importarlas.",!sources.length||!syntheses.length);
}
export function bindHermeneuticReviewUi(){
 const form=select("#herm-form");if(!form)return;
 form.addEventListener("submit",(event)=>{event.preventDefault();if(!ctx)return;
  const review={id:"HR-"+crypto.randomUUID(),project_id:String(ctx.project.id),project_revision:ctx.revision,
   interpretive_question:val("question"),claim:val("claim"),epistemic_grade:val("grade"),
   supporting_unit_ids:chosen("units"),evidence_ids:chosen("evidence"),L8_synthesis_id:val("l8"),L9_contrast_id:val("l9"),
   theory_source_id:val("source"),edition_and_page_or_section:val("locator"),consulted_extent_status:val("extent"),source_inspected:checked("source-inspected"),
   semiotic_operation:val("operation"),mapping_steps:val("mapping"),alternative_reading:val("alternative"),counterevidence:val("counterevidence"),scope_limit:val("scope"),
   epistemic_note:val("epistemic-note"),author_decision:val("decision"),human_decider:val("decider"),decision_date:val("decision-date"),status:val("status"),manuscript_claim_kind:val("claim-kind"),created_at:new Date().toISOString()};
  const result=validateHermeneuticReview(review,ctx.project);if(!result.ok){status(result.issues.join(" "),true);return;}
  const rows=loadHermeneuticReviews(localStorage,ctx.project.id,ctx.revision);rows.push(review);saveHermeneuticReviews(localStorage,ctx.project.id,ctx.revision,rows);renderRows();status("Propuesta L10 guardada solo en este navegador. No altera el proyecto fuente ni certifica la interpretación.");
 });
 select("#herm-export").addEventListener("click",()=>{if(!ctx)return;const out=hermeneuticReviewExport(ctx.project,ctx.revision,loadHermeneuticReviews(localStorage,ctx.project.id,ctx.revision));const url=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="hermeneutica-L10-"+String(ctx.project.id).replace(/[^a-z0-9_-]/gi,"-")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status("Propuestas L10 exportadas; los registros quedan separados de la fuente y de la certificación interpretativa.");});
}
