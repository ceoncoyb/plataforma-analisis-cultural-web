import test from "node:test";
import assert from "node:assert/strict";
import {
  validateModelReview, saveModelReviews, loadModelReviews, modelReviewStorageKey, modelReviewExport, declaredModelSources,
} from "../public/laboratorio/theory-review.mjs";

const project = {
  id:"study-01",
  sources:[{id:"SRC-GC",title:"García Contto, Manual de semiótica"}],
  units:[{id:"I01",type:"interval"},{id:"I02",type:"interval"}],
  evidence:[{id:"EV01",unit_id:"I01"},{id:"EV02",unit_id:"I02"}],
};
const ready = {
  source_id:"SRC-GC",unit_id:"I01",comparison_unit_id:"",
  evidence_id:"EV01",target_kind:"table",target_label:"Tabla 5",
  source_locator:"García Contto 2011, p. 49 (PDF p. 51)",
  model_locator:"Esquema de los ejes actanciales",
  operation:"actantial_role",claim:"El actor adopta un rol en una transformación visible.",
  limit:"No se prueba un programa narrativo completo ni la identidad del destinatario.",
  status:"ready_for_human_review",source_inspected:true,corpus_inspected:true,
  reviewer:"Investigador",
};
test("documented source and corpus traces are required before handoff to human review",()=>{
  assert.deepEqual(validateModelReview(ready,project),{ok:true,issues:[]});
  assert.ok(validateModelReview({...ready,source_id:"SRC-UNKNOWN"},project).issues.some(x=>x.includes("fuente registrada")));
  assert.ok(validateModelReview({...ready,evidence_id:"EV02"},project).issues.some(x=>x.includes("pertenezca")));
  assert.ok(validateModelReview({...ready,source_inspected:false},project).issues.some(x=>x.includes("fuente debe")));
  assert.ok(validateModelReview({...ready,reviewer:""},project).issues.some(x=>x.includes("persona revisora")));
  assert.ok(validateModelReview({...ready,model_locator:""},project).issues.some(x=>x.includes("página/edición")));
});
test("semiotic square cannot be certified through a generic evidence field",()=>{
  const result=validateModelReview({...ready,operation:"semiotic_square"},project);
  assert.equal(result.ok,false);
  assert.match(result.issues.join(" "),/contrariedad, contradicciones e implicaciones/);
  assert.equal(validateModelReview({...ready,operation:"semiotic_square",status:"draft"},project).ok,true);
});
test("comparative mythic or transductive claims require a distinct evidenced unit and remain unratified",()=>{
  for(const operation of ["mythic_semiosis","symbolic_convergence","transductive_hypothesis"]){
    const a=validateModelReview({...ready,operation},project);
    assert.equal(a.ok,false);
    assert.ok(a.issues.some(x=>x.includes("otra unidad")));
    assert.equal(validateModelReview({...ready,operation,comparison_unit_id:"I02"},project).ok,true);
  }
  assert.equal(validateModelReview({...ready,comparison_unit_id:"I01"},project).ok,false);
});
test("local-only records preserve project and revision scoping and exclude scans",()=>{
  const values=new Map();
  const storage={getItem:(k)=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const reviews=[{...ready,id:"MR1",interpretive_certification:"NOT_ASSESSED"}];
  const saved=saveModelReviews(storage,"study-01",379,reviews);
  assert.equal(saved.written_to_private_mcp,false);
  assert.equal(saved.synced_to_cloudflare_d1,false);
  assert.equal(saved.media_or_scans_stored,false);
  assert.deepEqual(loadModelReviews(storage,"study-01",379),reviews);
  assert.deepEqual(loadModelReviews(storage,"study-01",380),[]);
  assert.notEqual(modelReviewStorageKey("study-01",379),modelReviewStorageKey("other",379));
  values.set(modelReviewStorageKey("other",379),"{invalid");
  assert.deepEqual(loadModelReviews(storage,"other",379),[]);
  const output=modelReviewExport(project,379,reviews);
  assert.equal(output.read_only_source,true);
  assert.equal(output.interpretive_certification,"NOT_ASSESSED");
  assert.deepEqual(output.reviews,reviews);
  assert.equal(output.media_or_scans_stored,false);
});
test("Cloudflare web pilot exposes a local source-figure workbench without private MCP or D1 writes",async()=>{
  const {readFile}=await import("node:fs/promises");
  const html=await readFile(new URL("../public/laboratorio/index.html",import.meta.url),"utf8");
  const js=await readFile(new URL("../public/laboratorio/lab.js",import.meta.url),"utf8");
  const css=await readFile(new URL("../public/laboratorio/lab.css",import.meta.url),"utf8");
  const headers=await readFile(new URL("../public/_headers",import.meta.url),"utf8");
  for(const name of ["model-source","model-unit","model-evidence","model-locator","model-model-locator","model-operation","model-limit"]){
    assert.match(html,new RegExp('name="'+name+'"'));
  }
  assert.match(html,/No se copia a D1, al MCP, a GitHub ni a la exportación/);
  assert.match(js,/mountModelReview/);
  assert.match(js,/suggestModelUnit/);
  assert.match(css,/@media\(max-width:560px\)\{\.mm-model-pair/);
  assert.match(headers,/frame-src 'self' blob:/);
  assert.doesNotMatch(await readFile(new URL("../public/laboratorio/theory-review.mjs",import.meta.url),"utf8"),/fetch\(|navigator\.sendBeacon|XMLHttpRequest/);
});
test("declared academic models link only to matching imported bibliography and never claim automatic PDF review",()=>{
  const p={...project,analysis_modules:[
    {id:"SOURCE_FIGURE_THEORY_QA_GATE",source_models:[
      {source_id:"SRC-GC",name:"García Contto",printed_pages:["49","57"]},
      {source_id:"SRC-NOT-IMPORTED",name:"No declarado",printed_pages:["12"]}]},
    {id:"VIOLI",source_id:"SRC-GC",name:"Another source model",printed_pages:"15-26"},
  ]};
  const index=declaredModelSources(p);
  assert.deepEqual(index.map(x=>x.source_id),["SRC-GC"]);
  assert.equal(index[0].declared_locator,"49, 57");
  assert.equal(index[0].status,"DECLARED_NOT_VISUALLY_VERIFIED_BY_SITE");
  assert.deepEqual(declaredModelSources({...project,analysis_modules:[]}),[]);
});
