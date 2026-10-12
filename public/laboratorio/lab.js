import {
  projectExportToMultimodalReviewManifest, validateCandidateDecision,
  loadReviewDraft, saveReviewDraft, createReviewExport, toSeconds,
} from "/laboratorio/multimodal-review.mjs";

const $ = (s) => document.querySelector(s);
const state = { source: null, project: null, manifest: null, media: null, mediaUrl: null, mediaIdentity: "unknown", mediaHash: null, draft: { annotations: [], cut_candidate_decisions: [] }, selected: null, frameUrl: null, frameTimer: null };
let cloudQueue = Promise.resolve();
const safe = (v) => String(v ?? "");
const esc = (v) => safe(v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (v) => { const n = toSeconds(v); if (n == null) return safe(v) || "—"; const mm = Math.floor(n/60), ss = (n%60).toFixed(3).padStart(6,"0"); return `${String(mm).padStart(2,"0")}:${ss}`; };
const first = (...values) => values.find((v) => v !== undefined && v !== null && v !== "");
const idOf = (row) => String(row?.id ?? "");
function projectOf(source) { return source?.project && typeof source.project === "object" ? source.project : source; }
function setStatus(message, error = false) { const n=$("#import-status"); n.textContent=message; n.style.color=error?"#a6483f":""; }
function currentDecision(id) { return state.draft.cut_candidate_decisions.find((d)=>String(d.candidate_id)===String(id)); }
function scopeKey(manifest=state.manifest) { return manifest ? `${manifest.project_id}:r${manifest.revision??"unversioned"}` : ""; }
function setCloudStatus(message, { login=false, saved=false }={}) {
  const status=$("#cloudflare-sync-status");
  if(status)status.textContent=message;
  const connect=$("#connect-cloudflare");if(connect)connect.hidden=!login;
  const remove=$("#delete-cloud-draft");if(remove)remove.hidden=!saved;
}
function mergeRows(localRows,remoteRows,key,dateKey) {
  const merged=new Map();
  for(const row of remoteRows||[])if(row&&row[key]!=null)merged.set(String(row[key]),row);
  for(const row of localRows||[]) {
    if(!row||row[key]==null){continue;}
    const id=String(row[key]),existing=merged.get(id);
    if(!existing||Date.parse(row[dateKey]||"")>=Date.parse(existing[dateKey]||""))merged.set(id,row);
  }
  return [...merged.values()];
}
function sameRows(a,b,key) {
  const clean=(rows)=>[...(rows||[])].sort((x,y)=>String(x?.[key]??"").localeCompare(String(y?.[key]??"")));
  return JSON.stringify(clean(a))===JSON.stringify(clean(b));
}
function reviewPayload() {
  return { schema:"analysis-cultural/review-draft/v1", project_id:String(state.manifest.project_id),
    project_revision:state.manifest.revision??null, annotations:state.draft.annotations,
    cut_candidate_decisions:state.draft.cut_candidate_decisions };
}
function cloudUrl() {
  const query=new URLSearchParams({project_id:String(state.manifest.project_id),revision:String(state.manifest.revision??"unversioned")});
  return `/api/review-draft?${query}`;
}
async function cloudRequest(method,body) {
  const response=await fetch(cloudUrl(),{method,credentials:"same-origin",
    headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  const type=response.headers.get("content-type")||"";
  if(!type.includes("application/json"))throw Object.assign(new Error("Cloudflare Access login is required."),{login:true});
  const payload=await response.json();
  if(!response.ok)throw Object.assign(new Error(payload.error||`Cloudflare D1 returned ${response.status}.`),{status:response.status,login:response.status===401||response.status===403});
  return payload;
}
function queueCloudWrite(key=scopeKey()) {
  cloudQueue=cloudQueue.catch(()=>{}).then(async()=>{
    if(!state.manifest||scopeKey()!==key)return;
    if(!state.manifest.project_id){setCloudStatus("Este proyecto no trae un ID; su borrador permanece local.");return;}
    try {
      const saved=saveReviewDraft(localStorage,state.manifest.project_id,state.manifest.revision,state.draft);
      const result=await cloudRequest("POST",saved);
      setCloudStatus(`Sincronizado en D1 · ${result.updated_at}. El original y los medios siguen locales.`,{saved:true});
    } catch(error) {
      setCloudStatus(error.login?"D1 está protegida. Inicia sesión con Cloudflare Access para sincronizar." : `Copia local conservada; D1 no sincronizó: ${error.message}`,{login:Boolean(error.login)});
    }
  });
}
function loadCloudDraft(key=scopeKey()) {
  cloudQueue=cloudQueue.catch(()=>{}).then(async()=>{
    if(!state.manifest||scopeKey()!==key)return;
    if(!state.manifest.project_id){setCloudStatus("Este proyecto no trae un ID; su borrador permanece local.");return;}
    try {
      const remote=await cloudRequest("GET");
      if(!state.manifest||scopeKey()!==key)return;
      const local=state.draft, server=remote.draft||{annotations:[],cut_candidate_decisions:[]};
      const merged={annotations:mergeRows(local.annotations,server.annotations,"id","updated_at"),
        cut_candidate_decisions:mergeRows(local.cut_candidate_decisions,server.cut_candidate_decisions,"candidate_id","reviewed_at")};
      state.draft=merged;
      saveReviewDraft(localStorage,state.manifest.project_id,state.manifest.revision,merged);
      renderCandidates();renderDraft();
      const differs=!sameRows(merged.annotations,server.annotations,"id")
        ||!sameRows(merged.cut_candidate_decisions,server.cut_candidate_decisions,"candidate_id");
      if(differs&&(merged.annotations.length||merged.cut_candidate_decisions.length)) {
        const result=await cloudRequest("POST",reviewPayload());
        setCloudStatus(`Borrador conciliado y sincronizado en D1 · ${result.updated_at}.`,{saved:true});
      } else setCloudStatus(remote.updated_at?`Borrador recuperado de D1 · ${remote.updated_at}.`:"D1 conectada; aún no hay decisiones guardadas para esta revisión.",{saved:Boolean(remote.updated_at)});
    } catch(error) {
      setCloudStatus(error.login?"D1 está protegida. Inicia sesión con Cloudflare Access para recuperar o sincronizar." : `La copia local sigue disponible; D1 no respondió: ${error.message}`,{login:Boolean(error.login)});
    }
  });
}
function persistDraft() {
  if (!state.manifest) return;
  try { saveReviewDraft(localStorage,state.manifest.project_id,state.manifest.revision,state.draft); renderDraft(); queueCloudWrite(); }
  catch (error) { $("#draft-status").textContent=`No se pudo guardar en este navegador: ${error.message}`; }
}
function renderDraft() {
  const rows=state.draft.cut_candidate_decisions;
  $("#draft-status").textContent=`${rows.length} decisión(es) guardada(s) localmente · fuente intacta · proyecto ${state.manifest?.project_id || "—"} · revisión ${state.manifest?.revision ?? "sin versión"}.`;
  $("#draft-summary").innerHTML=["confirmed","false_positive","doubtful"].map((key)=>`<span class="mm-draft-chip">${({confirmed:"Confirmados",false_positive:"Falsos positivos",doubtful:"Dudosos"})[key]}: ${rows.filter((d)=>d.status===key).length}</span>`).join("");
}
function getExpectedHash(candidate) {
  const candidateHash=first(candidate.sha256,candidate.expected_sha256,candidate.content_hash);
  if (candidateHash) return String(candidateHash).replace(/^sha256:/i,"").toLowerCase();
  const sourceId=String(first(candidate.source_id,candidate.media_id,candidate.source?.id,""));
  const match=state.manifest.media_contract.expected_sources.find((s)=>sourceId && String(s.source_id)===sourceId) || (state.manifest.media_contract.expected_sources.length===1?state.manifest.media_contract.expected_sources[0]:null);
  return match?.sha256 || null;
}
function allExpectedHashes() {
  const known=[...(state.manifest?.media_contract.expected_sources||[]).map((s)=>s.sha256)];
  for(const candidate of state.manifest?.cut_candidates||[]){const hash=first(candidate.sha256,candidate.expected_sha256,candidate.content_hash);if(hash)known.push(String(hash).replace(/^sha256:/i,""));}
  return [...new Set(known.map((x)=>x.toLowerCase()))];
}
async function checkFileHash(file, expectedHashes) {
  const expected=[...new Set(expectedHashes.filter(Boolean))];
  if (!expected.length) { state.mediaIdentity="unknown";return; }
  if (!globalThis.crypto?.subtle) { state.mediaIdentity="unverifiable";return; }
  try { const digest=await globalThis.crypto.subtle.digest("SHA-256",await file.arrayBuffer()); const actual=[...new Uint8Array(digest)].map((x)=>x.toString(16).padStart(2,"0")).join(""); state.mediaHash=actual;state.mediaIdentity=expected.includes(actual)?"verified":"mismatch"; }
  catch { state.mediaIdentity="unverifiable"; }
}
function updateMediaMeta() {
  const n=$("#media-meta");
  n.textContent=state.media ? `${state.media.name} · ${(state.media.size/1024/1024).toFixed(1)} MB · ${state.mediaIdentity==="verified"?"SHA-256 verificado":state.mediaIdentity==="mismatch"?"SHA-256 NO COINCIDE":state.mediaIdentity==="unknown"?"El manifiesto no incluye SHA-256 verificable":"SHA-256 no disponible"} · archivo local` : "El archivo se mantiene en memoria de esta pestaña.";
}
function candidatesForInterval(intervalId) { return state.manifest.cut_candidates.filter((c)=>String(first(c.interval_id,c.unit_id,c.parent_id,c.target_interval_id,""))===String(intervalId)); }
function renderTree() {
  const root=$("#corpus-tree"), m=state.manifest;
  const byId=new Map([...m.sequences,...m.segments,...m.intervals,...m.frames].map((u)=>[String(u.id),u]));
  const renderedFrameIds=new Set();
  const button=(kind,row,depth=0)=>`<button type="button" class="${depth===1?"mm-tree-child":depth>1?"mm-tree-leaf":""}" data-select-kind="${kind}" data-select-id="${esc(row.id)}" ${state.selected?.id===String(row.id)?'aria-current="true"':''}><span>${esc(row.label||row.title||row.id)}</span><small>${esc(row.id)} · ${fmt(row.start)}${row.end!=null&&String(row.end)!==String(row.start)?`–${fmt(row.end)}`:""}</small></button>`;
  const html=[];
  for (const seq of m.sequences) {
    html.push(`<div class="mm-tree-group">Secuencia</div>`,button("sequence",seq));
    for (const segId of seq.segment_ids||[]) { const seg=byId.get(String(segId)); if(!seg)continue;html.push(button("segment",seg,1)); for(const iid of seg.interval_ids||[]){const interval=byId.get(String(iid));if(interval){html.push(button("interval",interval,2)); for(const f of m.frames.filter(x=>String(first(x.interval_id,x.unit_id,x.parent_id,""))===String(interval.id))){html.push(button("frame",f,2));renderedFrameIds.add(String(f.id));}}} }
    for (const iid of seq.direct_interval_ids||[]) { const interval=byId.get(String(iid));if(interval){html.push(button("interval",interval,1)); for(const f of m.frames.filter(x=>String(first(x.interval_id,x.unit_id,x.parent_id,""))===String(interval.id))){html.push(button("frame",f,2));renderedFrameIds.add(String(f.id));}} }
  }
  const represented=new Set(); for(const x of [...m.sequences,...m.segments,...m.intervals])represented.add(String(x.id));
  const unassigned=[...m.segments,...m.intervals,...m.frames].filter((x)=>x.type==="frame"?!renderedFrameIds.has(String(x.id)):!represented.has(String(x.id)) || (x.hierarchy_method==="unassigned"));
  if (!html.length) html.push(`<p class="mm-tree-empty">Este proyecto no contiene secuencias. Los registros disponibles aparecen abajo y pueden revisarse sin una jerarquía impuesta.</p>`);
  if (unassigned.length) html.push(`<div class="mm-tree-group">Sin jerarquía derivable</div>`,...unassigned.map((x)=>button(x.type||"unit",x,1)));
  if (!m.sequences.length) html.push(...m.intervals.map((x)=>button("interval",x,1)));
  root.innerHTML=html.join("")||`<p class="mm-tree-empty">Sin unidades navegables.</p>`;
  root.querySelectorAll("[data-select-id]").forEach((b)=>b.addEventListener("click",()=>selectRecord(b.dataset.selectKind,b.dataset.selectId)));
  $("#tree-total").textContent=String(m.sequences.length+m.segments.length+m.intervals.length+m.frames.length);
  $("#unassigned-list").innerHTML=unassigned.length?unassigned.map((x)=>`<p>${esc(x.id)} · ${esc(x.type||"registro")} · ${fmt(x.start)}</p>`).join(""):`<p>No hay registros sueltos.</p>`;
}
function renderCounts() {
  const c=state.manifest.counts;
  const cells=[[c.sequences,"secuencias"],[c.segments,"subsecuencias / grupos"],[c.intervals,"intervalos"],[c.frames,"fotogramas"],[c.cut_candidates,"cortes propuestos"],[c.evidence,"evidencias"]];
  $("#project-counts").innerHTML=cells.map(([num,label])=>`<div class="mm-stat"><strong>${num}</strong><span>${label}</span></div>`).join("");
}
function renderDetail(kind,id) {
  const row=[...state.manifest.sequences,...state.manifest.segments,...state.manifest.intervals,...state.manifest.frames].find((x)=>String(x.id)===String(id));
  if(!row){$("#detail-panel").innerHTML=`<p class="mm-warning">No se encontró el registro solicitado en el manifiesto.</p>`;return;}
  const isInterval=state.manifest.intervals.find((x)=>String(x.id)===String(id));
  const evidence=row.evidence || isInterval?.evidence || [];
  const analysis=row.analysis || isInterval?.analysis;
  const fields=[["ID canónico",row.id],["Tipo",row.type||kind],["Inicio",fmt(row.start)],["Final",fmt(row.end)],["ID de secuencia",row.sequence_id||row.parent_id||row.sequence_id||"—"],["Método de jerarquía",row.hierarchy_method||"relación declarada"],["Localizador",row.locator||"—"],["Procedencia",row.source_id||row.source?.id||row.provenance||"Conservada en fuente"]];
  const ev=evidence.length?evidence.map((e)=>`<div class="mm-evidence"><strong>${esc(e.id)} · ${esc(e.modality||e.kind||"evidencia")}</strong><p>${esc(e.locator||"Sin localizador")}${e.content?` · ${esc(e.content)}`:""}</p><small>ID unidad ${esc(e.unit_id)} · origen ${esc(e.source_id||"no indicado")}</small></div>`).join(""):`<p class="mm-result-state">No hay evidencias enlazadas directamente a este registro.</p>`;
  let analysisHtml="";
  if(analysis){const entries=Object.entries(analysis).filter(([k,v])=>!(["id","plastic","layer_tests","intermodal_relation","lyric_lexemes"].includes(k)) && typeof v==="string"&&v).map(([k,v])=>`<p><b>${esc(k.replaceAll("_"," "))}:</b> ${esc(v)}</p>`); for(const key of ["plastic","layer_tests","intermodal_relation","lyric_lexemes"])if(analysis[key]&&((Array.isArray(analysis[key])&&analysis[key].length)||(!Array.isArray(analysis[key])&&Object.keys(analysis[key]).length)))entries.push(`<p><b>${key.replaceAll("_"," ")}:</b> ${esc(JSON.stringify(analysis[key]))}</p>`); analysisHtml=entries.join("")||"<p>Hay análisis enlazado; los campos originales se conservan en la exportación.</p>";}
  $("#detail-panel").innerHTML=`<div class="mm-detail-head"><div><span class="lab-project-label">${esc(kind.toUpperCase())} · REGISTRO DEL CORPUS</span><h2>${esc(row.label||row.title||row.id)}</h2><p>El manifiesto original conserva los campos y relaciones completos.</p></div><span class="mm-tag">ID ${esc(row.id)}</span></div><div class="mm-detail-fields">${fields.map(([k,v])=>`<div class="mm-detail-field"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>${kind==="frame"?`<div class="mm-frame-actions"><button class="button button-dark button-small" id="preview-frame" type="button" ${state.media?"":"disabled"}>Mostrar fotograma desde el medio local</button><button class="button button-light button-small" id="seek-record" type="button" ${state.media?"":"disabled"}>Ir al tiempo en el medio</button></div><div id="frame-result"></div>`:""}<h3 class="mm-subsection-title">Evidencias vinculadas · ${evidence.length}</h3>${ev}${analysis?`<h3 class="mm-subsection-title">Análisis vinculado · ${esc(analysis.id||"sin ID")}</h3><div class="mm-analysis mm-analysis-grid">${analysisHtml}</div>`:""}<h3 class="mm-subsection-title">Cortes propuestos para este intervalo</h3><div class="mm-frame-actions">${isInterval&&candidatesForInterval(id).length?`<button class="button button-light button-small" id="jump-candidates" type="button">Ir a ${candidatesForInterval(id).length} candidato(s)</button>`:`<span class="mm-result-state">Sin candidatos enlazados directamente.</span>`}</div>`;
  $("#preview-frame")?.addEventListener("click",()=>previewFrame(row));
  $("#seek-record")?.addEventListener("click",()=>seekMedia(row.start));
  $("#jump-candidates")?.addEventListener("click",()=>$("#candidate-list").scrollIntoView({behavior:"smooth",block:"start"}));
}
function selectRecord(kind,id){state.selected={kind,id:String(id)};renderTree();renderDetail(kind,id);}
function renderCandidates(){
  const box=$("#candidate-list"),rows=state.manifest.cut_candidates;
  $("#candidate-total").textContent=String(rows.length);
  if(!rows.length){box.innerHTML=`<div class="mm-tree-empty">No hay cortes candidatos. Los intervalos y fotogramas del manifiesto siguen disponibles para recorrer.</div>`;return;}
  box.innerHTML=rows.map((c)=>{
    const id=String(c.id),d=currentDecision(id), proposed=first(c.proposed_time,c.timestamp,c.time,c.time_seconds,c.start,c.start_seconds,c.proposed_seconds), p=toSeconds(proposed), target=first(c.interval_id,c.unit_id,c.parent_id,c.target_interval_id,"sin intervalo asociado");
    const status=d?.status||"";
    return `<article class="mm-candidate" data-candidate="${esc(id)}"><div class="mm-candidate-head"><div><h3>${esc(c.label||c.title||`Candidato ${id}`)}</h3><p>ID ${esc(id)} · intervalo ${esc(target)} · propuesto ${fmt(proposed)} · origen ${esc(first(c.source_id,c.provenance,c.method,"no indicado"))}</p></div><span class="mm-status">${status?({confirmed:"Confirmado",false_positive:"Falso positivo",doubtful:"Dudoso"})[status]:"Pendiente de cotejo"}</span></div><div class="mm-candidate-grid"><label>Decisión humana<select data-field="status"><option value="">Pendiente</option><option value="confirmed" ${status==="confirmed"?"selected":""}>Confirmado</option><option value="false_positive" ${status==="false_positive"?"selected":""}>Falso positivo</option><option value="doubtful" ${status==="doubtful"?"selected":""}>Dudoso</option></select></label><label>Tiempo propuesto<input data-field="proposed" value="${esc(fmt(proposed))}" readonly></label><label>Tiempo observado (segundos)<input data-field="observed" type="number" step="0.001" min="0" value="${d?.observed_time_seconds??""}" placeholder="Coteja el medio"></label><label>Revisión por<input data-field="reviewer" value="${esc(d?.reviewed_by||"")}" maxlength="120" placeholder="Nombre / iniciales (opcional)"></label><label>Fecha de revisión<input data-field="date" type="date" value="${esc(d?.reviewed_at?.slice(0,10)||new Date().toISOString().slice(0,10))}"></label><textarea data-field="note" maxlength="1500" placeholder="Nota breve, criterio o límite de la decisión">${esc(d?.note||"")}</textarea></div><div class="mm-candidate-actions"><small class="mm-validation" aria-live="polite">${d?`Guardado ${esc(d.reviewed_at||"")} · medio ${esc(d.media_identity||"no cotejado")}`:"Carga el medio para registrar esta revisión."}</small><div><button class="button button-light button-small" data-seek="${esc(id)}" type="button">Ir al tiempo propuesto</button> <button class="button button-light button-small" data-now="${esc(id)}" type="button">Usar posición actual</button> <button class="button button-dark button-small" data-save="${esc(id)}" type="button">Guardar decisión</button></div></div></article>`;
  }).join("");
  box.querySelectorAll("[data-save]").forEach((btn)=>btn.addEventListener("click",()=>saveCandidate(btn.dataset.save)));
  box.querySelectorAll("[data-seek]").forEach((btn)=>btn.addEventListener("click",()=>{const c=state.manifest.cut_candidates.find((x)=>String(x.id)===btn.dataset.seek);seekMedia(first(c?.proposed_time,c?.timestamp,c?.time,c?.time_seconds,c?.start,c?.start_seconds));}));
  box.querySelectorAll("[data-now]").forEach((btn)=>btn.addEventListener("click",()=>{const el=mediaElement();const input=document.querySelector(`[data-candidate="${CSS.escape(btn.dataset.now)}"] [data-field="observed"]`);if(el&&input){input.value=el.currentTime.toFixed(3);input.focus();}}));
}
function saveCandidate(id){
  const c=state.manifest.cut_candidates.find((x)=>String(x.id)===String(id)),card=document.querySelector(`[data-candidate="${CSS.escape(String(id))}"]`);if(!c||!card)return;
  const get=(f)=>card.querySelector(`[data-field="${f}"]`),status=get("status").value;
  if(!status){card.querySelector(".mm-validation").textContent="Elige confirmado, falso positivo o dudoso.";card.querySelector(".mm-validation").classList.add("mm-candidate-error");return;}
  const proposedRaw=first(c.proposed_time,c.timestamp,c.time,c.time_seconds,c.start,c.start_seconds,c.proposed_seconds), proposed=toSeconds(proposedRaw), observed=get("observed").value===""?null:Number(get("observed").value);
  const expected=getExpectedHash(c), identity=expected?(state.mediaHash?(state.mediaHash===expected?"verified":"mismatch"):state.mediaIdentity):state.mediaIdentity;
  const validation=validateCandidateDecision({status,observed,proposed,mediaAvailable:Boolean(state.media),mediaIdentity:identity,shaRequired:Boolean(expected)});
  const msg=card.querySelector(".mm-validation");
  if(!validation.ok){msg.textContent=validation.reason;msg.classList.add("mm-candidate-error");return;}
  const intervalId=first(c.interval_id,c.unit_id,c.parent_id,c.target_interval_id,null);
  const decision={candidate_id:String(c.id),project_id:state.manifest.project_id,project_revision:state.manifest.revision??null,interval_id:intervalId==null?null:String(intervalId),status,reviewed_at:new Date(`${get("date").value||new Date().toISOString().slice(0,10)}T${new Date().toTimeString().slice(0,8)}.000Z`).toISOString(),reviewed_by:get("reviewer").value.trim()||null,proposed_time:proposedRaw??null,proposed_time_seconds:proposed,observed_time_seconds:observed,provenance:{...c},media:{filename:state.media.name,sha256_identity:state.mediaIdentity,expected_sha256:expected},note:get("note").value.trim()||null};
  const index=state.draft.cut_candidate_decisions.findIndex((d)=>String(d.candidate_id)===String(id));if(index>=0)state.draft.cut_candidate_decisions[index]=decision;else state.draft.cut_candidate_decisions.push(decision);
  persistDraft();renderCandidates();
}
function loadMedia(file){
  if(!file)return;
  if(!/^video\/|^audio\//.test(file.type)){setStatus("Elige un video o audio reproducible para cotejar tiempos.",true);return;}
  if(state.mediaUrl)URL.revokeObjectURL(state.mediaUrl);
  state.media=file;state.mediaUrl=URL.createObjectURL(file);state.mediaIdentity="unknown";state.mediaHash=null;
  const stage=$("#media-stage"),el=document.createElement(file.type.startsWith("video/")?"video":"audio");el.controls=true;el.playsInline=true;el.preload="metadata";el.src=state.mediaUrl;el.addEventListener("loadedmetadata",()=>{updateMediaMeta();if(state.manifest?.media_contract.duration_seconds){const delta=Math.abs(el.duration-state.manifest.media_contract.duration_seconds);if(delta>.08)$("#media-meta").textContent+=` · duración distinta al manifiesto (${el.duration.toFixed(3)} s vs ${state.manifest.media_contract.duration_seconds} s)`;}});stage.replaceChildren(el);$("#media-title").textContent=file.name;$("#media-meta").textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB · calculando verificación si el manifiesto contiene SHA-256 · archivo local`;
  const hashes=allExpectedHashes();if(hashes.length)checkFileHash(file,hashes).then(()=>{updateMediaMeta();renderCandidates();});else updateMediaMeta();renderCandidates();
}
function mediaElement(){return $("#media-stage")?.querySelector("video,audio");}
function seekMedia(value){const t=toSeconds(value),el=mediaElement();if(t==null||!el)return;el.currentTime=t;el.play().catch(()=>{});el.scrollIntoView({behavior:"smooth",block:"center"});}
function previewFrame(row){
  const video=$("#media-stage video"),out=$("#frame-result");
  if(!video){out.innerHTML=`<p class="mm-warning">Selecciona un video local para mostrar un fotograma real. El texto del manifiesto no es una imagen.</p>`;return;}
  const t=toSeconds(first(row.timestamp,row.time,row.start,row.start_seconds));if(t==null){out.innerHTML=`<p class="mm-warning">Este fotograma no tiene un tiempo que se pueda buscar.</p>`;return;}
  video.pause();video.currentTime=t;const capture=()=>{try{const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext("2d").drawImage(video,0,0);canvas.toBlob((blob)=>{if(!blob)return; if(state.frameUrl)URL.revokeObjectURL(state.frameUrl);state.frameUrl=URL.createObjectURL(blob);out.innerHTML=`<img class="mm-frame-preview" alt="Fotograma del archivo local en ${fmt(t)}" src="${state.frameUrl}"><p class="mm-result-state">Fotograma generado en el navegador · ${fmt(t)} · no se guarda ni se envía.</p>`;},"image/jpeg",.86);}catch{out.innerHTML=`<p class="mm-warning">No se pudo capturar el fotograma en este navegador.</p>`;}};
  video.addEventListener("seeked",capture,{once:true});
}
function recover(){state.draft=loadReviewDraft(localStorage,state.manifest.project_id,state.manifest.revision);renderCandidates();renderDraft();loadCloudDraft();setStatus(`Borrador local recuperado: ${state.draft.cut_candidate_decisions.length} decisión(es).`);}
function renderProject(source){
  state.source=source;state.project=projectOf(source);state.manifest=projectExportToMultimodalReviewManifest(source);
  const revision=state.manifest.revision;
  $("#review-app").hidden=false;$("#project-name").textContent=state.manifest.project_name||state.project.title||state.project.name||"Proyecto sin nombre";
  $("#project-details").textContent=`ID ${state.manifest.project_id||"no indicado"} · revisión ${revision??"sin versión"} · ${state.project.medium||"medio no especificado"} · fuente original de solo lectura`;
  $("#source-meta").textContent=`Proyecto ${state.manifest.project_id||"(sin ID)"} · revisión ${revision??"sin versión"} · importado desde archivo local · no hay conexión de escritura al MCP.`;
  renderCounts();state.draft=loadReviewDraft(localStorage,state.manifest.project_id,state.manifest.revision);renderTree();renderCandidates();renderDraft();
  if(state.project.cut_candidates?.length!==state.manifest.cut_candidates.length)setStatus("Se eliminaron IDs de candidatos duplicados durante la vista de revisión; el archivo original no se modificó.");else setStatus("Exportación leída. Verifica la revisión y selecciona el medio local antes de guardar cotejos.");
  setCloudStatus("Comprobando acceso protegido a D1…");loadCloudDraft();
  if(state.media)loadMedia(state.media);
}
$("#manifest-file").addEventListener("change",async(event)=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;try{const parsed=JSON.parse(await file.text());renderProject(parsed);}catch(error){$("#review-app").hidden=true;setStatus(`No se pudo importar este JSON: ${error.message}. Se espera una exportación del proyecto del plugin.`,true);}});
$("#media-file").addEventListener("change",(event)=>{const file=event.target.files?.[0];event.target.value="";loadMedia(file);});
$("#recover-draft").addEventListener("click",recover);
$("#delete-cloud-draft").addEventListener("click",async()=>{
  if(!state.manifest||!window.confirm("¿Eliminar de D1 la copia remota de las decisiones de este proyecto y revisión? La copia local no se borrará."))return;
  try{await cloudRequest("DELETE");setCloudStatus("Copia remota eliminada. La copia local sigue disponible y no se ha borrado.");}
  catch(error){setCloudStatus(error.login?"Inicia sesión con Cloudflare Access para borrar la copia remota.":`No se pudo eliminar la copia remota: ${error.message}`,{login:Boolean(error.login),saved:true});}
});
$("#export-review").addEventListener("click",()=>{if(!state.manifest)return;const annotations=state.draft.annotations;const result=createReviewExport(state.manifest,state.source,annotations,state.draft.cut_candidate_decisions);const blob=new Blob([JSON.stringify(result,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`revision-${(state.manifest.project_id||"proyecto").replace(/[^a-z0-9_-]/gi,"-")}-r${state.manifest.revision??"sin-version"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus("Revisión exportada como archivo separado. La fuente del plugin sigue intacta.");});
$("#no-script").hidden=true;

