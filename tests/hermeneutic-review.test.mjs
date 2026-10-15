import test from "node:test";
import assert from "node:assert/strict";
import {
  hermeneuticCorpus, hermeneuticBases, legacyHermeneuticReadings,
  validateHermeneuticReview, saveHermeneuticReviews, loadHermeneuticReviews,
  hermeneuticStorageKey, hermeneuticReviewExport,
} from "../public/laboratorio/hermeneutic-review.mjs";

const project={id:"study-L10",units:[{id:"I01"},{id:"I02"}],sources:[
  {id:"QZ",title:"Quezada, thesis"},{id:"LOT",title:"Lotman"},{id:"OTHER",title:"Not in the declared corpus"}],
  evidence:[{id:"EV1",unit_id:"I01"},{id:"EV2",unit_id:"I02"},{id:"EV3",unit_id:"I01"}],
  readings:[{id:"SYN8",layer:"L8_internal_semiotic_synthesis",claim:"Internal synthesis",status:"accepted_with_changes"},
    {id:"PENDING8",layer:"L8_internal_semiotic_synthesis",claim:"Pending synthesis",status:"pending"},
    {id:"CON9",layer:"L9_archetypal_functional_contrast",claim:"Optional contrast",status:"accepted_with_changes"},
    {id:"OLD10",layer:"L10_controlled_hermeneutics",claim:"Legacy proposal",status:"pending",evidence_positive:["EV1"],evidence_adverse:[]}],
  method_profile:{postsemiotic_hermeneutic_contract:{object_corpus:{theory_corpus:[
    {source_id:"QZ",role:"Primary theoretical source",consulted_extent_status:"specific_pages_verified"},
    {source_id:"LOT",role:"Optional cultural comparator",consulted_extent_status:"abstract_only"}]}}},
};
const valid={interpretive_question:"How does the recurrent transformation support this reading?",claim:"The repeated transition supports a bounded cultural hypothesis.",epistemic_grade:"SUPPORTED",
  supporting_unit_ids:["I01","I02"],evidence_ids:["EV1","EV2"],L8_synthesis_id:"SYN8",L9_contrast_id:"CON9",theory_source_id:"QZ",
  edition_and_page_or_section:"Verified edition, pp. 10–12",consulted_extent_status:"specific_pages_verified",source_inspected:true,
  semiotic_operation:"homology",mapping_steps:"A relation in L8 maps to the source concept through recurrence and transformed return.",
  alternative_reading:"The recurrence may function as a formal transition without cultural reference.",counterevidence:"No explicit paratext names the proposed cultural code.",scope_limit:"Applies to this sequence; no claim about creator intention.",author_decision:"pending",status:"ready_for_author_decision",manuscript_claim_kind:"discussion"};

test("source selector is restricted to the declared postsemiotic corpus and bases expose only L8/L9",()=>{
  assert.deepEqual(hermeneuticCorpus(project).map(x=>x.id),["QZ","LOT"]);
  assert.deepEqual(hermeneuticBases(project).map(x=>x.id),["SYN8","PENDING8","CON9"]);
  assert.equal(legacyHermeneuticReadings(project)[0].id,"OLD10");
});
test("valid source-grounded L10 proposal remains pending human decision",()=>{
  assert.deepEqual(validateHermeneuticReview(valid,project),{ok:true,issues:[]});
});
test("L10 cannot precede a registered L8 synthesis or use an undeclared theory source",()=>{
  assert.ok(validateHermeneuticReview({...valid,L8_synthesis_id:"missing"},project).issues.some(x=>x.includes("L8 existente")));
  assert.ok(validateHermeneuticReview({...valid,L8_synthesis_id:"PENDING8"},project).issues.some(x=>x.includes("aceptación humana")));
  assert.ok(validateHermeneuticReview({...valid,theory_source_id:"OTHER"},project).issues.some(x=>x.includes("corpus teórico")));
});
test("each evidence reference must belong to a selected unit",()=>{
  assert.ok(validateHermeneuticReview({...valid,supporting_unit_ids:["I02"],evidence_ids:["EV3"]},project).issues.some(x=>x.includes("pertenecer")));
  assert.ok(validateHermeneuticReview({...valid,supporting_unit_ids:["I01"]},project).issues.some(x=>x.includes("SUPPORTED exige apoyos")));
});
test("abstract-only sources cannot yield SUPPORTED and alternatives/counterevidence are required",()=>{
  const proposal={...valid,consulted_extent_status:"abstract_only",source_inspected:false,alternative_reading:"",counterevidence:""};
  const issues=validateHermeneuticReview(proposal,project).issues.join(" ");
  assert.match(issues,/SUPPORTED exige cotejo directo/);
  assert.match(issues,/lectura alternativa/);
  assert.match(issues,/contraevidencia/);
  assert.ok(validateHermeneuticReview({...valid,theory_source_id:"LOT",consulted_extent_status:"specific_pages_verified"},project).issues.some(x=>x.includes("perfil de fuentes declara")));
});
test("speculative proposal cannot be presented as a factual Results claim",()=>{
  const result=validateHermeneuticReview({...valid,epistemic_grade:"SPECULATIVE/OPEN",manuscript_claim_kind:"factual_results"},project);
  assert.ok(result.issues.some(x=>x.includes("hipótesis especulativa")));
});
test("authorial acceptance requires named decider and date",()=>{
  const result=validateHermeneuticReview({...valid,author_decision:"accepted",human_decider:"",decision_date:""},project);
  assert.ok(result.issues.some(x=>x.includes("identidad de quien decide y una fecha válida")));
  assert.deepEqual(validateHermeneuticReview({...valid,author_decision:"accepted",human_decider:"César Oncoy",decision_date:"2026-10-15",status:"decision_recorded"},project),{ok:true,issues:[]});
  assert.ok(validateHermeneuticReview({...valid,author_decision:"accepted",human_decider:"César Oncoy",decision_date:"2026-02-31",status:"decision_recorded"},project).issues.some(x=>x.includes("fecha válida")));
});
test("local L10 storage is project/revision scoped and never certifies or syncs",()=>{
  const values=new Map(),storage={getItem:(k)=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const saved=saveHermeneuticReviews(storage,"study-L10",383,[{...valid,id:"HR1"}]);
  assert.equal(saved.interpretive_certification,"NOT_ASSESSED");
  assert.equal(saved.synced_to_cloudflare_d1,false);assert.equal(saved.written_to_private_mcp,false);
  assert.equal(loadHermeneuticReviews(storage,"study-L10",383)[0].id,"HR1");
  assert.deepEqual(loadHermeneuticReviews(storage,"study-L10",384),[]);
  assert.notEqual(hermeneuticStorageKey("study-L10",383),hermeneuticStorageKey("other",383));
  assert.equal(hermeneuticReviewExport(project,383,[{...valid,id:"HR1"}]).interpretive_certification,"NOT_ASSESSED");
  assert.equal(legacyHermeneuticReadings(project)[0].status,"pending");
});
test("browser workbench mounts a separate L10 panel and never sends its records over the network",async()=>{
  const {readFile}=await import("node:fs/promises");
  const html=await readFile(new URL("../public/laboratorio/index.html",import.meta.url),"utf8");
  const lab=await readFile(new URL("../public/laboratorio/lab.js",import.meta.url),"utf8");
  const module=await readFile(new URL("../public/laboratorio/hermeneutic-review.mjs",import.meta.url),"utf8");
  assert.match(html,/id="herm-review-panel"/);assert.match(html,/L10 · INSTANCIA AUTORAL/);
  assert.match(html,/Lecturas L10 heredadas · consulta de solo lectura/);
  assert.match(lab,/mountHermeneuticReview\(state\.source/);assert.match(lab,/bindHermeneuticReviewUi\(\)/);
  assert.doesNotMatch(module,/fetch\(|sendBeacon|XMLHttpRequest/);
});
