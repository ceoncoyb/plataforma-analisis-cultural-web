import test from "node:test";
import assert from "node:assert/strict";
import { d1NameIsPresent, inspectReadiness } from "../scripts/cloudflare-readiness.mjs";

const cmd = (args) => args.join(" ");

function fixture(changes = {}) {
  const calls = [];
  const output = {
    "--version": { ok: true, stdout: "4.x\n" },
    "whoami": { ok: true, stdout: "private-account@example.test SECRET-SHOULD-NOT-APPEAR" },
    "pages project list": { ok: true, stdout: "│ plataforma-analisis-cultural-web │" },
    "d1 list --json": { ok: true, stdout: JSON.stringify([
      { name: "analisis-cultural-lab", uuid: "PRIVATE-DB-ID" },
    ]) },
    "pages secret list --project-name plataforma-analisis-cultural-web": {
      ok: true, stdout: "OPENAI_API_KEY\nCF_ACCESS_AUD\nNATIVE_CHAT_ENABLED\n",
    },
    ...changes,
  };
  return {
    calls,
    run(args) {
      calls.push(cmd(args));
      return output[cmd(args)] || { ok: false, stdout: "" };
    },
  };
}

test("read-only Wrangler metadata is summarized without leaking values or IDs", () => {
  const f = fixture();
  const report = inspectReadiness(f.run);
  assert.equal(report.wrangler_available, true);
  assert.equal(report.authenticated, "observed");
  assert.equal(report.pages_project, "observed");
  assert.equal(report.d1_database, "observed");
  assert.equal(report.secret_names.OPENAI_API_KEY, "observed");
  assert.equal(report.secret_names.CF_ACCESS_AUD, "observed");
  assert.equal(report.secret_names.CF_ACCESS_ALLOWED_EMAILS, "not_observed");
  const printed = JSON.stringify(report);
  assert.ok(!printed.includes("SECRET-SHOULD-NOT-APPEAR"));
  assert.ok(!printed.includes("PRIVATE-DB-ID"));
  assert.ok(!printed.includes("private-account@example.test"));
  assert.deepEqual(f.calls, [
    "--version", "whoami", "pages project list", "d1 list --json",
    "pages secret list --project-name plataforma-analisis-cultural-web",
  ]);
});

test("missing Wrangler stops without performing any account operations", () => {
  const f = fixture({ "--version": { ok: false, stdout: "private-error" } });
  const report = inspectReadiness(f.run);
  assert.equal(report.wrangler_available, false);
  assert.deepEqual(f.calls, ["--version"]);
  assert.ok(!JSON.stringify(report).includes("private-error"));
});

test("unconfirmed authentication fails closed without probing D1 or secrets", () => {
  const f = fixture({ whoami: { ok: false, stdout: "invalid token PRIVATE-VALUE" } });
  const report = inspectReadiness(f.run);
  assert.equal(report.authenticated, "not_confirmed");
  assert.equal(report.pages_project, "unknown");
  assert.deepEqual(f.calls, ["--version", "whoami"]);
  assert.ok(!JSON.stringify(report).includes("PRIVATE-VALUE"));
});

test("unsupported list commands or malformed D1 JSON are unknown rather than proof of absence", () => {
  const f = fixture({
    "pages project list": { ok: false, stdout: "unauthorized" },
    "d1 list --json": { ok: true, stdout: "not json, private-content" },
    "pages secret list --project-name plataforma-analisis-cultural-web": {
      ok: false, stdout: "unavailable",
    },
  });
  const report = inspectReadiness(f.run);
  assert.equal(report.pages_project, "unknown");
  assert.equal(report.d1_database, "unknown");
  assert.equal(report.secret_names.OPENAI_API_KEY, "unknown");
  assert.ok(!JSON.stringify(report).includes("private-content"));
});

test("D1 matching is exact and protects against similar database names", () => {
  assert.equal(d1NameIsPresent(JSON.stringify([{ name: "analisis-cultural-lab-backup" }])), false);
  assert.equal(d1NameIsPresent(JSON.stringify([{ name: "analisis-cultural-lab" }])), true);
  assert.equal(d1NameIsPresent("not json"), null);
});

test("secret names are not mistaken for similarly prefixed keys", () => {
  const f = fixture({
    "pages secret list --project-name plataforma-analisis-cultural-web": {
      ok: true,
      stdout: "OPENAI_API_KEY_OLD\nNATIVE_CHAT_ENABLED_PREVIEW\n",
    },
  });
  const report = inspectReadiness(f.run);
  assert.equal(report.secret_names.OPENAI_API_KEY, "not_observed");
  assert.equal(report.secret_names.NATIVE_CHAT_ENABLED, "not_observed");
});
