import test from "node:test";
import assert from "node:assert/strict";
import { auditPages } from "../scripts/monitor-pages.mjs";

const assets = ["/assets/site.aaaaaaaaaaaa.css", "/assets/site.bbbbbbbbbbbb.js"];
function html(path) {
  const base = '<html><head><meta name="description" content="test"></head><body>';
  if (path === "/") return base + 'Sigue cada hallazgo <a href="/demo/">Demo</a></body></html>';
  if (path === "/demo/") return base + 'Una ficha sintética <input id="media-files">' +
    assets.map((a) => '<link href="' + a + '"><script src="' + a + '"></script>').join("") + "</body></html>";
  if (path === "/laboratorio/") return base + '<input id="manifest-file"><script src="/laboratorio/lab.js"></script></body></html>';
  if (path === "/support/") return base + 'Reporta un problema reproducible <a href="https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/new">Nueva incidencia</a></body></html>';
  return base + "</body></html>";
}
function stub({ changes = {}, inject = {} } = {}) {
  return async (url) => {
    const path = new URL(url).pathname;
    const status = changes[path] ?? (path.startsWith("/api/") ? 503 : 200);
    return new Response(inject[path] ?? html(path), {
      status,
      headers: { "content-type": "text/html", ...(status === 302 ? { location: "https://login.cloudflareaccess.com/" } : {}) },
    });
  };
}

test("all public routes healthy; known Access blocker is not mistaken for live D1", async () => {
  const report = await auditPages({ fetchImpl: stub() });
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length, 2);
  assert.equal(report.checks.some((c) => c.path === assets[0] && c.status === 200), true);
});

test("broken demo produces an alert", async () => {
  const report = await auditPages({ fetchImpl: stub({ changes: { "/demo/": 404 } }) });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /demo\/.*404/);
});

test("external legacy link produces an alert", async () => {
  const bad = html("/") + '<a href="https://bad.chatgpt.site/">Legacy</a>';
  const report = await auditPages({ fetchImpl: stub({ inject: { "/": bad } }) });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /chatgpt\.site/);
});

test("unauthenticated API HTTP 200 produces an alert", async () => {
  const report = await auditPages({ fetchImpl: stub({ changes: { "/api/session": 200 } }) });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /anonymous.*200/);
});

test("Access login redirect is unverified, not an API success", async () => {
  const report = await auditPages({ fetchImpl: stub({ changes: { "/api/session": 302 } }) });
  assert.equal(report.ok, true);
  assert.match(report.warnings.join(" "), /not followed/);
});

test("a missing fingerprinted asset produces an alert", async () => {
  const report = await auditPages({ fetchImpl: stub({ changes: { [assets[1]]: 404 } }) });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /assets.*404/);
});

test("network errors do not leak exception details or secrets", async () => {
  const report = await auditPages({ fetchImpl: async () => { throw new Error("secret_token_xyz"); } });
  assert.equal(report.ok, false);
  assert.equal(JSON.stringify(report).includes("secret_token_xyz"), false);
});


test("unexpected external auth redirect causes regression", async () => {
  const fetchImpl = async (url) => new URL(url).pathname === "/api/session"
    ? new Response(null, { status: 302, headers: { location: "https://attacker.example/login" } })
    : stub()(url);
  const report = await auditPages({ fetchImpl });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /unsafe authentication redirect/);
});

test("scheme-relative hostile redirect causes regression", async () => {
  const fetchImpl = async (url) => new URL(url).pathname === "/api/review-draft"
    ? new Response(null, { status: 302, headers: { location: "//attacker.example/" } })
    : stub()(url);
  assert.equal((await auditPages({ fetchImpl })).ok, false);
});

test("redirect without a Location header causes regression", async () => {
  const fetchImpl = async (url) => new URL(url).pathname === "/api/session"
    ? new Response(null, { status: 302 }) : stub()(url);
  assert.equal((await auditPages({ fetchImpl })).ok, false);
});

test("valid team-domain Access redirect remains unverified but not a security failure", async () => {
  const fetchImpl = async (url) => new URL(url).pathname === "/api/session"
    ? new Response(null, { status: 302, headers: { location: "https://myteam.cloudflareaccess.com/cdn-cgi/access/login/test" } })
    : stub()(url);
  const report = await auditPages({ fetchImpl });
  assert.equal(report.ok, true);
  assert.match(report.warnings.join(" "), /authentication redirect not followed/);
});

test("lookalike Cloudflare hostname causes regression", async () => {
  const fetchImpl = async (url) => new URL(url).pathname === "/api/session"
    ? new Response(null, { status: 302, headers: { location: "https://team.cloudflareaccess.com.attacker.example/login" } })
    : stub()(url);
  assert.equal((await auditPages({ fetchImpl })).ok, false);
});

test("same-origin non-Access redirection causes regression", async () => {
  const fetchImpl = async (url) => new URL(url).pathname === "/api/session"
    ? new Response(null, { status: 302, headers: { location: "/" } })
    : stub()(url);
  assert.equal((await auditPages({ fetchImpl })).ok, false);
});


test("a missing support route is treated as a public regression", async () => {
  const report = await auditPages({ fetchImpl: stub({ changes: { "/support/": 404 } }) });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /support\/.*404/);
});
