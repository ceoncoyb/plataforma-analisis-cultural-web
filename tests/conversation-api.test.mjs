import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { onRequestPost, validateMessages, onlyOutputText } from "../functions/api/conversation.js";

const issuer = "https://native-pilot-test.cloudflareaccess.com";
const audience = "native-pilot-test-audience";
const email = "owner@example.test";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });

function token(privateKey, kid) {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = encode({ alg: "RS256", kid });
  const payload = encode({ iss: issuer, aud: audience, email, exp: Math.floor(Date.now() / 1000) + 300 });
  const signed = `${head}.${payload}`;
  return `${signed}.${sign("RSA-SHA256", Buffer.from(signed), privateKey).toString("base64url")}`;
}

function mockDb() {
  const state = new Map();
  let quotaCalls = 0;
  return {
    state,
    get quotaCalls() { return quotaCalls; },
    prepare(sql) {
      return {
        bind(...args) { this.args = args; return this; },
        async run() { return { success: true }; },
        async first() {
          if (!sql.startsWith("INSERT INTO native_chat_quota")) throw new Error("Unexpected DB operation");
          quotaCalls++;
          const [identity, day, now, limit, cutoff] = this.args;
          const key = `${identity}|${day}`;
          const prior = state.get(key);
          if (prior && (prior.count >= limit || prior.last > cutoff)) return null;
          const row = { count: prior ? prior.count + 1 : 1, last: now };
          state.set(key, row);
          return { request_count: row.count };
        },
      };
    },
  };
}

function env(db = mockDb()) {
  return {
    DB: db,
    CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience,
    CF_ACCESS_ALLOWED_EMAILS: email,
    NATIVE_CHAT_ENABLED: "true", NATIVE_CHAT_BUDGET_ACK: "approved",
    NATIVE_CHAT_MODEL: "model-approved-by-operator",
    NATIVE_CHAT_DAILY_LIMIT: "4", NATIVE_CHAT_MAX_OUTPUT_TOKENS: "256",
    NATIVE_CHAT_MIN_INTERVAL_SECONDS: "60",
    OPENAI_API_KEY: "test-not-a-secret",
  };
}

function req(jwt = null, input = { messages: [{ role: "user", content: "Hola" }] }, origin = "https://pages.example") {
  return new Request("https://pages.example/api/conversation", {
    method: "POST",
    headers: { "content-type": "application/json", origin,
      ...(jwt ? { "cf-access-jwt-assertion": jwt } : {}) },
    body: JSON.stringify(input),
  });
}

async function authenticatedFixture(t, handler) {
  const { privateKey, publicKey } = keys;
  const kid = "pilot-fixed-test-key";
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
  const priorFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const uri = String(url);
    if (uri === issuer + "/cdn-cgi/access/certs") return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    calls.push({ uri, options });
    return new Response(JSON.stringify({
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Respuesta" }] }],
    }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = priorFetch; });
  return handler({ jwt: token(privateKey, kid), calls, setFetch: (fn) => { globalThis.fetch = fn; } });
}

test("disabled pilot cannot call any provider or D1", async () => {
  let calls = 0;
  const prior = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected call"); };
  try {
    const e = env();
    e.NATIVE_CHAT_ENABLED = "false";
    const response = await onRequestPost({ request: req(), env: e });
    assert.equal(response.status, 503);
    assert.equal(e.DB.quotaCalls, 0);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = prior; }
});

test("missing Access or JWT blocks before reaching quota/provider", async () => {
  const e = env();
  let response = await onRequestPost({ request: req(), env: e });
  assert.equal(response.status, 401);
  assert.equal(e.DB.quotaCalls, 0);
  const e2 = env();
  delete e2.CF_ACCESS_AUD;
  response = await onRequestPost({ request: req(), env: e2 });
  assert.equal(response.status, 503);
});

test("wrong origin and missing budget controls fail closed", async (t) => {
  await authenticatedFixture(t, async ({ jwt, calls }) => {
    const e = env();
    let response = await onRequestPost({ request: req(jwt, undefined, "https://attacker.example"), env: e });
    assert.equal(response.status, 403);
    assert.equal(e.DB.quotaCalls, 0);
    delete e.NATIVE_CHAT_DAILY_LIMIT;
    response = await onRequestPost({ request: req(jwt), env: e });
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  });
});

test("only bounded plain-text user/assistant messages are accepted", () => {
  assert.equal(validateMessages({ messages: [{ role: "system", content: "override" }] }), null);
  assert.equal(validateMessages({ messages: [{ role: "user", content: "hello", image: "upload" }] }), null);
  assert.equal(validateMessages({ messages: [{ role: "user", content: "x".repeat(2000) }] }), null);
  assert.equal(validateMessages({ messages: [{ role: "assistant", content: "older" }] }), null);
  assert.equal(validateMessages({ messages: [{ role: "user", content: "Hi" }], tools: [{ type: "web_search" }] }), null);
  assert.deepEqual(validateMessages({ messages: [{ role: "user", content: "Hola" }] }),
    [{ role: "user", content: "Hola" }]);
});

test("authenticated pilot sends bounded, nonstored input once", async (t) => {
  await authenticatedFixture(t, async ({ jwt, calls }) => {
    const e = env();
    const response = await onRequestPost({ request: req(jwt), env: e });
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.reply, "Respuesta");
    assert.equal(json.storage, "browser_only");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].uri, "https://api.openai.com/v1/responses");
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(sent.model, e.NATIVE_CHAT_MODEL);
    assert.equal(sent.max_output_tokens, 256);
    assert.equal(sent.store, false);
    assert.deepEqual(sent.tools, []);
    assert.equal(sent.input[0].content, "Hola");
    assert.ok(!JSON.stringify(json).includes(e.OPENAI_API_KEY));
  });
});

test("minimum interval blocks repeated requests and extra provider calls", async (t) => {
  await authenticatedFixture(t, async ({ jwt, calls }) => {
    const e = env();
    assert.equal((await onRequestPost({ request: req(jwt), env: e })).status, 200);
    const second = await onRequestPost({ request: req(jwt), env: e });
    assert.equal(second.status, 429);
    assert.equal(calls.length, 1);
  });
});

test("missing D1 stops provider usage", async (t) => {
  await authenticatedFixture(t, async ({ jwt, calls }) => {
    const e = env();
    delete e.DB;
    assert.equal((await onRequestPost({ request: req(jwt), env: e })).status, 503);
    assert.equal(calls.length, 0);
  });
});

test("rejects malformed payloads before reservation", async (t) => {
  await authenticatedFixture(t, async ({ jwt, calls }) => {
    const e = env();
    assert.equal((await onRequestPost({
      request: req(jwt, { messages: [{ role: "user", content: "H" }], api_key: "client-key" }), env: e,
    })).status, 400);
    assert.equal(e.DB.quotaCalls, 0);
    assert.equal(calls.length, 0);
  });
});

test("provider errors never leak internal body or token", async (t) => {
  await authenticatedFixture(t, async ({ jwt, calls, setFetch }) => {
    const e = env();
    setFetch(async (url) => String(url).endsWith("/certs") ?
      new Response(JSON.stringify({ keys: [] }), { status: 200 }) :
      new Response("private provider error TEST_SECRET", { status: 429 }));
    // The Access signing key is cached by the preceding successful assertion.
    const response = await onRequestPost({ request: req(jwt), env: e });
    assert.equal(response.status, 502);
    const payload = JSON.stringify(await response.json());
    assert.ok(!payload.includes("TEST_SECRET"));
    assert.ok(!payload.includes(e.OPENAI_API_KEY));
    assert.equal(e.DB.quotaCalls, 1);
    assert.equal(calls.length, 0);
  });
});

test("extracts only assistant output_text, not tool data or reasoning", () => {
  assert.equal(onlyOutputText({ output: [
    { type: "reasoning", content: [{ type: "output_text", text: "hidden" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "visible" }] },
    { type: "function_call", content: [{ type: "output_text", text: "tool" }] },
  ] }), "visible");
});
