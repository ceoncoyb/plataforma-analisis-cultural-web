import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { onRequestGet } from "../functions/api/session.js";

const team = "https://test-team.cloudflareaccess.com";
const email = "owner@example.test";
const audience = "session-test-audience";
const env = {
  CF_ACCESS_TEAM_DOMAIN: team,
  CF_ACCESS_AUD: audience,
  CF_ACCESS_ALLOWED_EMAILS: email,
};

function signingFixture() {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = { ...pair.publicKey.export({ format: "jwk" }),
    kid: "session-test-key", alg: "RS256", use: "sig" };
  function makeToken(claims = {}) {
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const header = encode({ alg: "RS256", kid: publicKey.kid });
    const payload = encode({
      iss: team, aud: audience, email,
      exp: Math.floor(Date.now() / 1000) + 300,
      ...claims,
    });
    const unsigned = header + "." + payload;
    return unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), pair.privateKey).toString("base64url");
  }
  return { makeToken, publicKey };
}

function requestFor(jwt, returnTo) {
  const url = "https://pages.example/api/session"
    + (returnTo === undefined ? "" : "?return_to=" + encodeURIComponent(returnTo));
  return new Request(url, { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} });
}

test("session API fails closed when Access settings are incomplete", async () => {
  const result = await onRequestGet({ request: requestFor(), env: {} });
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("session API rejects unauthenticated and malformed tokens", async () => {
  let result = await onRequestGet({ request: requestFor(), env });
  assert.equal(result.status, 401);
  result = await onRequestGet({ request: requestFor("not-a-jwt"), env });
  assert.equal(result.status, 403);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("session API redirects only to safe same-origin routes after JWT verification", async () => {
  const { makeToken, publicKey } = signingFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, team + "/cdn-cgi/access/certs");
    return new Response(JSON.stringify({ keys: [publicKey] }), { status: 200 });
  };
  try {
    const jwt = makeToken();
    let result = await onRequestGet({ request: requestFor(jwt), env });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get("location"), "https://pages.example/laboratorio/");
    for (const path of ["/demo/", "/laboratorio/"]) {
      result = await onRequestGet({ request: requestFor(jwt, path), env });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get("location"), "https://pages.example" + path);
    }
    for (const unsafe of ["https://attacker.example/", "//attacker.example/path",
      "/\\attacker.example/path", "javascript:alert(1)", "http://pages.example/"]) {
      result = await onRequestGet({ request: requestFor(jwt, unsafe), env });
      assert.equal(result.status, 400, "unsafe return_to must be rejected: " + unsafe);
      assert.equal(result.headers.get("cache-control"), "no-store");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("session API rejects wrong audience, email, expired JWT and unexpected issuer", async () => {
  const { makeToken, publicKey } = signingFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicKey] }), { status: 200 });
  try {
    const wrongClaims = [
      { aud: "wrong-aud" },
      { email: "intruder@example.test" },
      { exp: Math.floor(Date.now() / 1000) - 20 },
      { iss: "https://evil.cloudflareaccess.com" },
    ];
    for (const claims of wrongClaims) {
      const result = await onRequestGet({ request: requestFor(makeToken(claims)), env });
      assert.equal(result.status, 403, "JWT should be rejected for " + JSON.stringify(Object.keys(claims)));
    }
  } finally { globalThis.fetch = originalFetch; }
});
