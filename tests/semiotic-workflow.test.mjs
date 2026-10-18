import test from "node:test";
import assert from "node:assert/strict";
import { SEMIOTIC_STAGES, auditSemioticJourney } from "../public/laboratorio/semiotic-workflow.mjs";
test("declares the full staged route from corpus integrity through controlled hermeneutics",()=>{
 assert.deepEqual(SEMIOTIC_STAGES.map(s=>s.id),["L0","L1","L1a","L2","L3","L3a","L4","L5","L6","L7","L8","L9","L10"]);
 assert.ok(SEMIOTIC_STAGES.find(s=>s.id==="L8").depends.includes("L7"));
 assert.ok(SEMIOTIC_STAGES.find(s=>s.id==="L9").depends.includes("L8"));
 assert.ok(SEMIOTIC_STAGES.find(s=>s.id==="L10").depends.includes("L9"));
});
test("does not mistake declared layers for executed records or certification",()=>{
 const result=auditSemioticJourney({project:{id:"p",method_profile:{layers:SEMIOTIC_STAGES.map(s=>({id:s.id+"_"+s.label}))},units:[{id:"I1"}]}});
 assert.equal(result.declaration_count,13);
 assert.equal(result.records_detected_count,0);
 assert.equal(result.certification,"NOT_ASSESSED");
 assert.equal(result.missing_execution_records.length,13);
});
test("record presence is not interpretive certification",()=>{
 const result=auditSemioticJourney({project:{id:"p",readings:[{id:"A1",layer:"L3_audiovisual_relational_analysis"}],semic_analyses:[{id:"S1"}]}});
 assert.equal(result.stages.find(s=>s.id==="L3").records,1);
 assert.equal(result.stages.find(s=>s.id==="L3a").records,1);
 assert.equal(result.stages.find(s=>s.id==="L8").records,0);
 assert.equal(result.certification,"NOT_ASSESSED");
});
