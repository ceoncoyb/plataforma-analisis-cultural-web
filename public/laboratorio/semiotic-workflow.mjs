export const SEMIOTIC_STAGES = [
{id:"L0",label:"Integridad del corpus",depends:[],keys:["units","sequences","segments","intervals","frames","sources","evidence"],gate:"IDs, jerarquía, reloj, localizadores y fuentes coherentes."},
{id:"L1",label:"Observación descriptiva",depends:["L0"],keys:["interval_analyses","intervalAnalyses","observations"],gate:"Descripción observable separada de interpretación."},
{id:"L1a",label:"Segmentación léxica",depends:["L1"],keys:["lexical_analyses","lexicalAnalyses","lexical_segments","lexicalSegments"],gate:"Lexemas localizados sin asignación anticipada de sentido."},
{id:"L2",label:"Alineación intermodal",depends:["L1","L1a"],keys:["intermodal_alignments","intermodalAlignments","vocalization_analyses","vocalizationAnalyses"],gate:"Alineación temporal de imagen, letra, voz, silencio y sonido."},
{id:"L3",label:"Relaciones audiovisuales",depends:["L1","L2"],keys:["interval_analyses","intervalAnalyses"],gate:"Relaciones formales sustentadas por tomas y localizadores."},
{id:"L3a",label:"Sema, clasema y semema",depends:["L3"],keys:["semic_analyses","semicAnalyses","semic_sememic_analyses"],gate:"Núcleo, contexto, composición, contraste y contraevidencia separados."},
{id:"L4",label:"Sintaxis narrativa",depends:["L3a"],keys:["narrative_analyses","narrativeAnalyses"],gate:"Estados, junciones, transformaciones y programas narrativos."},
{id:"L5",label:"Actantes y modalidades",depends:["L4"],keys:["actantial_analyses","actantialAnalyses","narrative_analyses","narrativeAnalyses"],gate:"Roles y querer/deber/saber/poder-hacer justificados."},
{id:"L6",label:"Isotopías y valores",depends:["L3a","L4","L5"],keys:["discursive_analyses","discursiveAnalyses","isotopy_analyses","isotopyAnalyses"],gate:"Recurrencia demostrada; no inferir isotopía por una aparición."},
{id:"L7",label:"Semántica fundamental",depends:["L6"],keys:["deep_semantic_structures","deepSemanticStructures","deep_semantic_analyses"],gate:"Oposiciones e implicaciones demostradas; cuadrado solo si procede."},
{id:"L8",label:"Síntesis intratextual",depends:["L1","L1a","L2","L3","L3a","L4","L5","L6","L7"],keys:["internal_syntheses","internalSyntheses","semiotic_syntheses","semioticSyntheses"],gate:"Síntesis de la obra independiente del repertorio externo."},
{id:"L9",label:"Contraste arquetípico",depends:["L8"],keys:["archetypal_contrasts","archetypalContrasts","comparative_analyses"],gate:"Contraste delimitado posterior a L8, con procedencia y localizadores."},
{id:"L10",label:"Hermenéutica controlada",depends:["L8","L9"],keys:["hermeneutic_readings","hermeneuticReadings","postsemiotic_readings","postsemioticReadings"],gate:"Alternativas, contraevidencia, fuentes y dictamen humano."}
];
const list=v=>Array.isArray(v)?v:[];
export function auditSemioticJourney(input){
 const p=input?.project&&typeof input.project==="object"?input.project:(input||{});
 const declared=list(p?.method_profile?.layers);
 const stages=SEMIOTIC_STAGES.map(s=>{
  const records=s.keys.reduce((n,k)=>n+list(p[k]).length,0);
  const config=declared.some(x=>String(x?.id||"").startsWith(s.id+"_")||String(x?.id||"").includes(s.label));
  return {...s,declared:config,records,status:records?"RECORDS_DETECTED_NOT_CERTIFIED":"NO_EXECUTION_RECORD_DETECTED"};
 });
 return {schema:"analysis-cultural/semiotic-journey-audit/v1",project_id:String(p.id||input?.project_id||""),revision:p.revision??null,certification:"NOT_ASSESSED",stage_count:stages.length,declaration_count:stages.filter(s=>s.declared).length,records_detected_count:stages.filter(s=>s.records>0).length,missing_execution_records:stages.filter(s=>!s.records).map(s=>s.id),stages,warnings:["La declaración de una capa no demuestra ejecución.","La presencia de registros no certifica su calidad ni su interpretación.","No completar etapas con inferencias sin evidencia.","L8–L10 requieren síntesis independiente, contraevidencia y revisión humana."]};
}
export function renderSemioticJourneyAudit(project,root){
 const a=auditSemioticJourney(project);root.replaceChildren();
 const summary=document.createElement("p");summary.className="mm-journey-summary";summary.textContent=`Recorrido ${a.stage_count} etapas · ${a.records_detected_count} con registros detectados · ${a.missing_execution_records.length} sin registros detectados · certificación interpretativa: no evaluada.`;root.append(summary);
 const table=document.createElement("table");table.className="mm-journey-table";const head=document.createElement("tr");
 for(const label of ["Etapa","Estado","Registros","Dependencias","Control"]) {const th=document.createElement("th");th.textContent=label;head.append(th);}
 const thead=document.createElement("thead");thead.append(head);table.append(thead);const body=document.createElement("tbody");
 for(const s of a.stages){const tr=document.createElement("tr");for(const value of [s.id+" · "+s.label,s.status,String(s.records),s.depends.join(", ")||"—",s.gate]){const td=document.createElement("td");td.textContent=value;tr.append(td);}body.append(tr);}
 table.append(body);root.append(table);const ul=document.createElement("ul");for(const w of a.warnings){const li=document.createElement("li");li.textContent=w;ul.append(li);}root.append(ul);return a;
}
