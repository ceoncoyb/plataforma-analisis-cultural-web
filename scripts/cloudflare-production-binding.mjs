/**
 * Inspect only the STRUCTURE of a Pages config downloaded with authenticated
 * Wrangler. No configuration value, ID, email, stderr or secret is printed.
 *
 * Run with WRANGLER_BIN pointing to an already-installed wrangler.cmd if
 * Wrangler is not available on PATH. Requires no dashboard or SMS login.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "plataforma-analisis-cultural-web";
const DATABASE = "analisis-cultural-lab";
const ACCESS_NAMES = [
  "CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "CF_ACCESS_ALLOWED_EMAILS",
  "OPENAI_API_KEY",
];
const UNKNOWN = "unknown";

function parseAssignment(line) {
  const match = /^\s*([A-Za-z_][\w-]*)\s*=\s*(["'])(.*?)\2\s*(?:#.*)?$/.exec(line);
  return match ? [match[1], match[3]] : null;
}

export function inspectProductionToml(text) {
  if (typeof text !== "string") return null;
  let section = "";
  let productionBinding = false;
  let productionDatabase = false;
  let productionBlocks = 0;
  let block = {};
  const names = new Set();
  function finishBlock() {
    if (section === "env.production.d1_databases") {
      productionBlocks++;
      if (block.binding === "DB") {
        productionBinding = true;
        if (block.database_name === DATABASE) productionDatabase = true;
      }
    }
    block = {};
  }
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[\[([\w.-]+)\]\]\s*(?:#.*)?$/.exec(line);
    const single = /^\s*\[([\w.-]+)\]\s*(?:#.*)?$/.exec(line);
    if (header || single) {
      finishBlock();
      section = (header || single)[1];
      continue;
    }
    const pair = parseAssignment(line);
    if (!pair) continue;
    if (section === "env.production.d1_databases") {
      block[pair[0]] = pair[1];
    } else if (section === "env.production.vars" && ACCESS_NAMES.includes(pair[0])) {
      names.add(pair[0]);
    }
  }
  finishBlock();
  return {
    config_read: "observed",
    production_d1_block_count: productionBlocks,
    production_db_binding: productionBinding ? "observed" : "not_observed",
    production_expected_database: productionDatabase ? "observed" : "not_observed",
    vars_declared_in_download: Object.fromEntries(
      ACCESS_NAMES.map((name) => [name, names.has(name) ? "observed" : "not_observed"]),
    ),
    cautions: [
      "Wrangler config downloads may exclude secrets; not_observed is not proof of absence.",
      "The presence of a declared binding does not prove runtime Access or D1 operations.",
      "Never commit or print the downloaded config, which may contain private values.",
    ],
  };
}

export function downloadAndInspect({ runner = spawnSync, makeDir = mkdtempSync,
  listDir = readdirSync, read = readFileSync, remove = rmSync } = {}) {
  const dir = makeDir(join(tmpdir(), "cultural-pages-config-"));
  try {
    const bin = process.env.WRANGLER_BIN || "wrangler";
    const result = runner(bin, ["pages", "download", "config", PROJECT], {
      cwd: dir, encoding: "utf8", timeout: 30000,
      maxBuffer: 1024 * 1024, shell: process.platform === "win32",
      windowsHide: true, env: {
        ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false",
      },
    });
    if (result.error || result.status !== 0) {
      return { config_read: UNKNOWN, production_db_binding: UNKNOWN,
        production_expected_database: UNKNOWN };
    }
    const filename = listDir(dir).find((name) =>
      name === "wrangler.toml");
    if (!filename) return { config_read: UNKNOWN, production_db_binding: UNKNOWN,
      production_expected_database: UNKNOWN };
    return inspectProductionToml(read(join(dir, filename), "utf8"));
  } catch {
    return { config_read: UNKNOWN, production_db_binding: UNKNOWN,
      production_expected_database: UNKNOWN };
  } finally {
    // The generated configuration can contain non-secret env values: erase it,
    // including on error or timeout, and never put it in GitHub or logs.
    remove(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) ===
    (await import("node:path")).resolve(process.argv[1])) {
  process.stdout.write(JSON.stringify(downloadAndInspect(), null, 2) + "\n");
}
