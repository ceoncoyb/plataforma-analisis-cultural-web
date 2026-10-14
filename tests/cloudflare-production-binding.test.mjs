import test from "node:test";
import assert from "node:assert/strict";
import { inspectProductionToml, downloadAndInspect }
  from "../scripts/cloudflare-production-binding.mjs";

const production = [
  'name = "plataforma-analisis-cultural-web"',
  'pages_build_output_dir = "./dist"',
  '[[env.production.d1_databases]]',
  'binding = "DB"',
  'database_name = "analisis-cultural-lab"',
  'database_id = "DO-NOT-LOG-PRIVATE-UUID"',
  '[env.production.vars]',
  'CF_ACCESS_AUD = "DO-NOT-LOG-PRIVATE-AUDIENCE"',
  'CF_ACCESS_ALLOWED_EMAILS = "owner@example.test"',
].join("\n");

test("detects the exact D1 DB binding in production without exposing values", () => {
  const out = inspectProductionToml(production);
  assert.equal(out.production_d1_binding, "observed");
  assert.equal(out.production_expected_database, "observed");
  assert.equal(out.production_d1_block_count, 1);
  assert.equal(out.vars_declared_in_download.CF_ACCESS_AUD, "observed");
  assert.equal(out.vars_declared_in_download.CF_ACCESS_TEAM_DOMAIN, "not_observed");
  assert.equal(out.vars_declared_in_download.OPENAI_API_KEY, "not_observed");
  assert.ok(!JSON.stringify(out).includes("DO-NOT-LOG"));
  assert.ok(!JSON.stringify(out).includes("owner@example.test"));
});

test("a preview binding never proves production DB is configured", () => {
  const out = inspectProductionToml([
    '[[env.preview.d1_databases]]',
    'binding = "DB"',
    'database_name = "analisis-cultural-lab"',
  ].join("\n"));
  assert.equal(out.production_db_binding, "not_observed");
  assert.equal(out.production_expected_database, "not_observed");
});

test("wrong production database is not mistaken for the expected one", () => {
  const out = inspectProductionToml([
    '[[env.production.d1_databases]]',
    'binding = "DB"',
    'database_name = "unrelated-db"',
  ].join("\n"));
  assert.equal(out.production_db_binding, "observed");
  assert.equal(out.production_expected_database, "not_observed");
});

test("separately matches multiple production D1 blocks without cross-binding", () => {
  const out = inspectProductionToml([
    '[[env.production.d1_databases]]',
    'binding = "OTHER"',
    'database_name = "analisis-cultural-lab"',
    '[[env.production.d1_databases]]',
    'binding = "DB"',
    'database_name = "another-database"',
  ].join("\n"));
  assert.equal(out.production_db_binding, "observed");
  assert.equal(out.production_expected_database, "not_observed");
  assert.equal(out.production_d1_block_count, 2);
});

test("redacts CLI output and always deletes downloaded config", () => {
  let deleted = false;
  const stdout = "DO-NOT-PRINT-ACCOUNT-ID-OR-TOKEN";
  const result = downloadAndInspect({
    runner(bin, args, options) {
      assert.deepEqual(args, [
        "pages", "download", "config", "plataforma-analisis-cultural-web",
      ]);
      assert.ok(options.cwd.includes("mock-private-config"));
      return { status: 0, stdout };
    },
    makeDir() { return "/tmp/mock-private-config"; },
    listDir() { return ["wrangler.toml"]; },
    read() { return production; },
    remove(p, options) {
      assert.equal(p, "/tmp/mock-private-config");
      assert.equal(options.recursive, true);
      deleted = true;
    },
  });
  assert.equal(deleted, true);
  assert.equal(result.production_expected_database, "observed");
  assert.ok(!JSON.stringify(result).includes(stdout));
  assert.ok(!JSON.stringify(result).includes("DO-NOT-LOG"));
});

test("on a Wrangler failure, no config or secret is printed and cleanup runs", () => {
  let deleted = false;
  const result = downloadAndInspect({
    runner() { return { status: 1, stderr: "DO-NOT-PRINT-ERROR" }; },
    makeDir() { return "/tmp/mock-private-config"; },
    listDir() { throw new Error("should not read"); },
    remove() { deleted = true; },
  });
  assert.equal(deleted, true);
  assert.equal(result.production_db_binding, "unknown");
  assert.ok(!JSON.stringify(result).includes("DO-NOT-PRINT-ERROR"));
});
