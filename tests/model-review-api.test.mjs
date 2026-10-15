import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { onRequestDelete, onRequestGet, onRequestPost } from "../functions/api/source-model-reviews.js";
import { createModelReviewSyncRequest, validateModelReviewVault } from "../public/laboratorio/model-review-sync.mjs";

const issuer="https://thesis-lab.cloudflareaccess.com";
const audience="test-audience-tag";
const owner="owner@example.test";
const other="other@example.test";
const accessTestKeys=generateKeyPairSync("rsa",{modulusLength:2048});
function makeToken(privateKey,kid,email=owner,claims={}) {
  const encode=(value)=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const header=encode({alg:"RS256",typ:"JWT",kid}),payload=encode({iss:issuer,aud:audience,email,exp:Math.floor(Date.now()/1000)+300,...claims});
  const input=`${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url")}`;
}
function fakeDb() {
  const rows=[],calls=[];
  return {rows,calls,prepare(sql) {
    const statement={sql,values:[],bind(...values){this.values=values;return this;},
      async run(){calls.push(sql);const v=this.values;
        if(sql.startsWith("INSERT INTO")){
          if(rows.some((row)=>row.user_email===v[0]&&row.project_id===v[1]&&row.project_revision===v[2]&&(row.snapshot_id===v[3]||row.content_sha256===v[5])))return {success:false};
          rows.push({user_email:v[0],project_id:v[1],project_revision:v[2],snapshot_id:v[3],created_at:v[4],content_sha256:v[5],review_count:v[6],reviews_json:v[7]});
          return {success:true,meta:{changes:1}};
        }
        if(sql.startsWith("DELETE FROM")){
          const index=rows.findIndex((row)=>row.user_email===v[0]&&row.project_id===v[1]&&row.project_revision===v[2]&&row.snapshot_id===v[3]);
          if(index>=0)rows.splice(index,1);
          return {success:true,meta:{changes:index>=0?1:0}};
        }
        return {success:true,meta:{changes:0}};
      },
      async first(){calls.push(sql);const v=this.values;
        if(sql.includes("COUNT(*)"))return {total:rows.filter((row)=>row.user_email===v[0]&&row.project_id===v[1]&&row.project_revision===v[2]).length};
        const found=rows.find((row)=>row.user_email===v[0]&&row.project_id===v[1]&&row.project_revision===v[2]&&
          (sql.includes("content_sha256 = ?")?row.content_sha256===v[3]:row.snapshot_id===v[3]));
        return found?{...found}:null;
      },
      async all(){calls.push(sql);const v=this.values;return {results:rows.filter((row)=>row.user_email===v[0]&&row.project_id===v[1]&&row.project_revision===v[2])
        .sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.snapshot_id.localeCompare(a.snapshot_id)).slice(0,v[3])
        .map(({snapshot_id,created_at,content_sha256,review_count})=>({snapshot_id,created_at,content_sha256,review_count}))};},
    };
    return statement;
  }};
}

const project={id:"study-01",sources:[{id:"SRC-GC",title:"García Contto, Manual de semiótica"}],
  units:[{id:"I01",type:"interval"},{id:"I02",type:"interval"}],
  evidence:[{id:"EV01",unit_id:"I01"},{id:"EV02",unit_id:"I02"}]};
const review={id:"MR1",project_id:"study-01",project_revision:381,source_id:"SRC-GC",source_title:"García Contto, Manual de semiótica",
  unit_id:"I01",comparison_unit_id:"",evidence_id:"EV01",source_locator:"2011, p. 49",model_locator:"Esquema actancial",
  target_kind:"table",target_label:"Tabla 5",operation:"actantial_role",claim:"El actor ocupa una función en el programa observado.",
  limit:"La sucesión visual no prueba por sí sola una transformación completa.",status:"ready_for_human_review",reviewer:"Investigador",
  source_inspected:true,corpus_inspected:true,reviewed_at:"2026-10-15T12:00:00.000Z",interpretive_certification:"NOT_ASSESSED",
  model_media:"LOCAL_PREVIEW_NOT_STORED"};
const document={schema:"analysis-cultural/source-model-reviews/v1",project_id:"study-01",project_revision:381,
  read_only_source:true,status:"pending_academic_review",interpretive_certification:"NOT_ASSESSED",
  synced_to_cloudflare_d1:false,written_to_private_mcp:false,media_or_scans_stored:false,reviews:[review]};
const sync=createModelReviewSyncRequest(document,project);

async function configured(t) {
  const {privateKey,publicKey}=accessTestKeys;
  const kid="key-stable-source-review-test";
  const jwk={...publicKey.export({format:"jwk"}),kid,alg:"RS256",use:"sig"};
  const previous=globalThis.fetch;
  globalThis.fetch=async(url)=>url===`${issuer}/cdn-cgi/access/certs`?
    new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{"content-type":"application/json"}}):new Response("unexpected",{status:404});
  t.after(()=>{globalThis.fetch=previous;});
  const db=fakeDb(),env={DB:db,CF_ACCESS_TEAM_DOMAIN:issuer,CF_ACCESS_AUD:audience,CF_ACCESS_ALLOWED_EMAILS:`${owner},${other}`};
  const headers={origin:"https://pages.example","content-type":"application/json","cf-access-jwt-assertion":makeToken(privateKey,kid)};
  return {db,env,headers,token:(email)=>makeToken(privateKey,kid,email)};
}

test("source-model snapshot requires a verified Access identity before touching D1",async(t)=>{
  const {db,env}=await configured(t);
  const response=await onRequestGet({request:new Request("https://pages.example/api/source-model-reviews?project_id=study-01&revision=381"),env});
  assert.equal(response.status,401);
  assert.equal(db.calls.length,0);
});

test("explicit sync stores an idempotent immutable snapshot scoped by identity, project and revision",async(t)=>{
  const {db,env,headers,token}=await configured(t);
  let response=await onRequestPost({request:new Request("https://pages.example/api/source-model-reviews",{method:"POST",headers,body:JSON.stringify(sync)}),env});
  assert.equal(response.status,201);
  let body=await response.json();
  assert.equal(body.vault.schema,"analysis-cultural/source-model-review-vault/v1");
  assert.equal(body.vault.stored_in_cloudflare_d1,true);
  assert.equal(body.vault.interpretive_certification,"NOT_ASSESSED");
  assert.equal(body.vault.written_to_private_mcp,false);
  assert.equal(body.vault.media_or_scans_stored,false);
  const snapshotId=body.vault.snapshot_id;
  assert.equal(db.rows.length,1);
  assert.equal(db.rows[0].user_email,owner);
  assert.deepEqual(JSON.parse(db.rows[0].reviews_json),[review]);
  assert.equal(JSON.parse(db.rows[0].reviews_json)[0].model_media,"LOCAL_PREVIEW_NOT_STORED");

  response=await onRequestPost({request:new Request("https://pages.example/api/source-model-reviews",{method:"POST",headers,body:JSON.stringify(sync)}),env});
  assert.equal(response.status,200);
  assert.equal((await response.json()).duplicate,true);
  assert.equal(db.rows.length,1);

  response=await onRequestGet({request:new Request("https://pages.example/api/source-model-reviews?project_id=study-01&revision=381",{headers}),env});
  body=await response.json();
  assert.equal(body.vault.snapshots.length,1);
  assert.equal(Object.hasOwn(body.vault.snapshots[0],"reviews"),false);

  response=await onRequestGet({request:new Request(`https://pages.example/api/source-model-reviews?project_id=study-01&revision=381&snapshot_id=${snapshotId}`,{headers}),env});
  body=await response.json();
  assert.deepEqual(body.vault.reviews,[review]);
  assert.deepEqual(validateModelReviewVault(body,"study-01",381),body.vault);

  const otherHeaders={...headers,"cf-access-jwt-assertion":token(other)};
  response=await onRequestGet({request:new Request("https://pages.example/api/source-model-reviews?project_id=study-01&revision=381",{headers:otherHeaders}),env});
  assert.deepEqual((await response.json()).vault.snapshots,[]);
  response=await onRequestDelete({request:new Request(`https://pages.example/api/source-model-reviews?project_id=study-01&revision=381&snapshot_id=${snapshotId}`,{method:"DELETE",headers:otherHeaders}),env});
  assert.equal((await response.json()).deleted,false);
  assert.equal(db.rows.length,1);
});

test("server rejects cross-origin writes and mismatched source, unit or evidence references before persistence",async(t)=>{
  const {db,env,headers}=await configured(t);
  let response=await onRequestPost({request:new Request("https://pages.example/api/source-model-reviews",{method:"POST",headers:{...headers,origin:"https://attacker.example"},body:JSON.stringify(sync)}),env});
  assert.equal(response.status,403);
  const invalid={...sync,references:{...sync.references,evidence:[{id:"EV01",unit_id:"I02"}]}};
  const sameOriginHeaders={...headers,origin:"https://pages.example"};
  response=await onRequestPost({request:new Request("https://pages.example/api/source-model-reviews",{method:"POST",headers:sameOriginHeaders,body:JSON.stringify(invalid)}),env});
  assert.equal(response.status,400);
  assert.match((await response.json()).issues.join(" "),/no pertenece/);
  assert.equal(db.rows.length,0);
});

test("methodological guardrails remain server-side and snapshots can be deleted one at a time",async(t)=>{
  const {db,env,headers}=await configured(t);
  const invalidReview={...review,operation:"semiotic_square"};
  const invalid={...sync,document:{...document,reviews:[invalidReview]}};
  const sameOriginHeaders={...headers,origin:"https://pages.example"};
  let response=await onRequestPost({request:new Request("https://pages.example/api/source-model-reviews",{method:"POST",headers:sameOriginHeaders,body:JSON.stringify(invalid)}),env});
  assert.equal(response.status,400);
  assert.match((await response.json()).issues.join(" "),/cuadrado semiótico/);
  assert.equal(db.calls.length,0);

  response=await onRequestPost({request:new Request("https://pages.example/api/source-model-reviews",{method:"POST",headers:sameOriginHeaders,body:JSON.stringify(sync)}),env});
  const snapshotId=(await response.json()).vault.snapshot_id;
  response=await onRequestDelete({request:new Request(`https://pages.example/api/source-model-reviews?project_id=study-01&revision=381&snapshot_id=${snapshotId}`,{method:"DELETE",headers:sameOriginHeaders}),env});
  assert.equal(response.status,200);
  assert.equal((await response.json()).deleted,true);
  assert.equal(db.rows.length,0);
});

test("browser sync payload sends identifiers only in its reference index",()=>{
  const request=createModelReviewSyncRequest(document,project);
  assert.deepEqual(request.references,{source_ids:["SRC-GC"],unit_ids:["I01","I02"],evidence:[{id:"EV01",unit_id:"I01"},{id:"EV02",unit_id:"I02"}]});
  assert.equal(Object.hasOwn(request.references,"sources"),false);
  assert.equal(JSON.stringify(request.references).includes("García Contto"),false);
  assert.equal(JSON.stringify(request.references).includes("EV01"),true);
});
