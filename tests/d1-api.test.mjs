import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { onRequestDelete, onRequestGet, onRequestPost } from "../functions/api/review-draft.js";

const issuer="https://thesis-lab.cloudflareaccess.com";
const audience="test-audience-tag";
const email="owner@example.test";

function makeToken(privateKey, kid, claims={}) {
  const encode=(value)=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const header=encode({alg:"RS256",typ:"JWT",kid});
  const payload=encode({iss:issuer,aud:audience,email,exp:Math.floor(Date.now()/1000)+300,...claims});
  const input=`${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url")}`;
}

function fakeDb() {
  let row=null;
  const calls=[];
  return {calls,prepare(sql){
    const bound={bind(...values){this.values=values;return this;},
      async run(){calls.push(sql);if(sql.startsWith("INSERT INTO"))row={user_email:this.values[0],project_id:this.values[1],project_revision:this.values[2],updated_at:this.values[3],draft_json:this.values[4]};if(sql.startsWith("DELETE FROM")&&row?.user_email===this.values[0]&&row?.project_id===this.values[1]&&row?.project_revision===this.values[2])row=null;return {success:true};},
      async first(){calls.push(sql);return row&&row.user_email===this.values[0]&&row.project_id===this.values[1]&&row.project_revision===this.values[2]?row:null;}};
    return bound;
  }};
}

test("D1 API denies requests without a verified Access identity before touching the database",async()=>{
  const db=fakeDb();
  const request=new Request("https://pages.example/api/review-draft?project_id=thesis&revision=174");
  const response=await onRequestGet({request,env:{DB:db,CF_ACCESS_TEAM_DOMAIN:issuer,CF_ACCESS_AUD:audience,CF_ACCESS_ALLOWED_EMAILS:email}});
  assert.equal(response.status,401);
  assert.equal(db.calls.length,0);
});

test("D1 API validates Access JWT, scopes drafts to the owner/project/revision, and supports read/write/delete",async()=>{
  const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk={...publicKey.export({format:"jwk"}),kid:"test-key",alg:"RS256",use:"sig"};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>url===`${issuer}/cdn-cgi/access/certs`?new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{"content-type":"application/json"}}):new Response("unexpected",{status:404});
  try {
    const db=fakeDb(),token=makeToken(privateKey,"test-key");
    const env={DB:db,CF_ACCESS_TEAM_DOMAIN:issuer,CF_ACCESS_AUD:audience,CF_ACCESS_ALLOWED_EMAILS:email};
    const headers={"cf-access-jwt-assertion":token,origin:"https://pages.example"};
    const draft={schema:"analysis-cultural/review-draft/v1",project_id:"thesis-oncoy",project_revision:174,
      annotations:[],cut_candidate_decisions:[{candidate_id:"cut-1",status:"confirmed",reviewed_at:"2026-10-12T12:00:00Z",note:"Cotejado"}]};
    let response=await onRequestPost({request:new Request("https://pages.example/api/review-draft",{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify(draft)}),env});
    assert.equal(response.status,200);
    response=await onRequestGet({request:new Request("https://pages.example/api/review-draft?project_id=thesis-oncoy&revision=174",{headers}),env});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).draft.cut_candidate_decisions,draft.cut_candidate_decisions);
    response=await onRequestGet({request:new Request("https://pages.example/api/review-draft?project_id=other&revision=174",{headers}),env});
    assert.deepEqual((await response.json()).draft,{annotations:[],cut_candidate_decisions:[]});
    response=await onRequestDelete({request:new Request("https://pages.example/api/review-draft?project_id=thesis-oncoy&revision=174",{method:"DELETE",headers}),env});
    assert.equal(response.status,200);
    response=await onRequestGet({request:new Request("https://pages.example/api/review-draft?project_id=thesis-oncoy&revision=174",{headers}),env});
    assert.deepEqual((await response.json()).draft,{annotations:[],cut_candidate_decisions:[]});
  } finally {globalThis.fetch=originalFetch;}
});

test("D1 API rejects unauthorized emails and cross-origin writes",async()=>{
  const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk={...publicKey.export({format:"jwk"}),kid:"second-key",alg:"RS256",use:"sig"};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{"content-type":"application/json"}});
  try {
    const db=fakeDb(),env={DB:db,CF_ACCESS_TEAM_DOMAIN:issuer,CF_ACCESS_AUD:audience,CF_ACCESS_ALLOWED_EMAILS:email};
    const notOwner=makeToken(privateKey,"second-key",{email:"visitor@example.test"});
    let response=await onRequestPost({request:new Request("https://pages.example/api/review-draft",{method:"POST",headers:{"content-type":"application/json",origin:"https://pages.example","cf-access-jwt-assertion":notOwner},body:JSON.stringify({project_id:"x",project_revision:1,annotations:[],cut_candidate_decisions:[]})}),env});
    assert.equal(response.status,403);
    const owner=makeToken(privateKey,"second-key");
    response=await onRequestPost({request:new Request("https://pages.example/api/review-draft",{method:"POST",headers:{"content-type":"application/json",origin:"https://attacker.example","cf-access-jwt-assertion":owner},body:JSON.stringify({project_id:"x",project_revision:1,annotations:[],cut_candidate_decisions:[]})}),env});
    assert.equal(response.status,403);
    assert.equal(db.calls.length,0);
  } finally {globalThis.fetch=originalFetch;}
});
