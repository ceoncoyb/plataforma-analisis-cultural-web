export const SEMIOTIC_STAGES = [
{id:"L0",label:"Integridad del corpus",depends:[],keys:["units","sources","evidence"],gate:"IDs, jerarquía, reloj, localizadores y fuentes coherentes."},
{id:"L1",label:"Observación descriptiva",depends:["L0"],keys:["interval_analyses"],field:"observable_visual",gate:"Descripción observable separada de interpretación."},
{id:"L1a",label:"Segmentación léxica",depends:["L1"],keys:["lexical_analyses","lexical_segments"],gate:"Lexemas localizados sin asignación anticipada de sentido."},
{id:"L2",label:"Alineación intermodal",depends:["L1","L1a"],keys:["readings"],layer:"L2_intermodal_alignment",gate:"Alineación temporal de imagen, letra, voz, silencio y sonido."},
{id:"L3",label:"Relaciones audiovisuales",depends:["L1","L2"],keys:["readings"],layer:"L3_audiovisual_relational_analysis",gate:"Relaciones formales sustentadas por tomas y localizadores."},
{id:"L3a",label:"Sema, clasema y semema",depends:["L3"],keys:["semic_analyses"],gate:"Núcleo, contexto, composición, contraste y contraevidencia separados."},
{id:"L4",label:"Sintaxis narrativa",depends:["L3a"],keys:["readings"],layer:"L4_narrative_surface",gate:"Estados, junciones, transformaciones y programas narrativos."},
{id:"L5",label:"Actantes y modalidades",depends:["L4"],keys:["readings"],layer:"L5_actantial_modal",gate:"Roles y querer/deber/saber/poder-hacer justificados."},
{id:"L6",label:"Isotopías y valores",depends:["L3a","L4","L5"],keys:["readings"],layer:"L6_thematic_axiological_isotopic",gate:"Recurrencia demostrada; no inferir isotopía por una aparición."},
{id:"L7",label:"Semántica fundamental",depends:["L6"],keys:["readings","deep_semantic_structures"],layer:"L7_deep_semantic_structure",gate:"Oposiciones e implicaciones demostradas; cuadrado solo si procede."},
{id:"L8",label:"Síntesis intratextual",depends:["L1","L1a","L2","L3","L3a","L4","L5","L6","L7"],keys:["readings"],layer:"L8_internal_semiotic_synthesis",gate:"Síntesis de la obra independiente del repertorio externo."},
{id:"L9",label:"Contraste arquetípico",depends:["L8"],keys:["readings"],layer:"L9_archetypal_functional_contrast",gate:"Contraste delimitado posterior a L8, con procedencia y localizadores."},
{id:"L10",label:"Hermenéutica controlada",depends:["L8","L9"],keys:["readings"],layer:"L10_controlled_hermeneutics",gate:"Alternativas, contraevidencia, fuentes y dictamen humano."}
];
const list=v=>Array.isArray(v)?v:[];
function recordsFor(project,stage){
 let rows=stage.keys.flatMap(key=>list(project?.[key]));
 if(stage.layer) rows=rows.filter(row=>row?.layer===stage.layer);
 if(stage.field) rows=rows.filter(row=>typeof row?.[stage.field]==="string"&&row[stage.field].trim().length>0);
 return rows.length;
}
export function auditSemioticJourney(input){
 const p=input?.project&&typeof input.project==="object"?input.project:(input||{});
 const declared=list(p?.method_profile?.layers);
 const stages=SEMIOTIC_STAGES.map(s=>{
  const records=recordsFor(p,s);
  const config=declared.some(x=>String(x?.id||"").startsWith(s.id+"_"));
  return {...s,declared:config,records,status:records?"RECORDS_DETECTED_NOT_CERTIFIED":"NO_EXECUTION_RECORD_DETECTED"};
 });
 return {schema:"analysis-cultural/semiotic-journey-audit/v1",project_id:String(p.id||input?.project_id||""),revision:p.revision??null,certification:"NOT_ASSESSED",stage_count:stages.length,declaration_count:stages.filter(s=>s.declared).length,records_detected_count:stages.filter(s=>s.records>0).length,missing_execution_records:stages.filter(s=>!s.records).map(s=>s.id),stages,warnings:["La declaración de una capa no demuestra ejecución.","Los registros se atribuyen a su capa declarada; la presencia no certifica calidad ni verdad interpretativa.","La segmentación léxica no se presume a partir de la mera presencia de letra o vocalización.","No completar etapas con inferencias sin evidencia.","L8–L10 requieren síntesis independiente, contraevidencia y revisión humana."]};
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
