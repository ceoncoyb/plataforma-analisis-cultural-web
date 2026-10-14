/**
 * Read-only Cloudflare Pages readiness probe.
 * Reports only boolean/status metadata; never outputs CLI stdout, keys,
 * access tokens, account identifiers or the contents of secrets.
 *
 * Run: node scripts/cloudflare-readiness.mjs
 * Optional: WRANGLER_BIN can point to an already-installed Wrangler CLI.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PROJECT = "plataforma-analisis-cultural-web";
const D1_DATABASE = "analisis-cultural-lab";
const SECRET_NAMES = [
  "OPENAI_API_KEY", "CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD",
  "CF_ACCESS_ALLOWED_EMAILS", "NATIVE_CHAT_ENABLED",
  "NATIVE_CHAT_BUDGET_ACK", "NATIVE_CHAT_MODEL",
  "NATIVE_CHAT_DAILY_LIMIT", "NATIVE_CHAT_MAX_OUTPUT_TOKENS",
  "NATIVE_CHAT_MIN_INTERVAL_SECONDS",
];

function status(ok, observed) {
  return !ok ? "unknown" : observed ? "observed" : "not_observed";
}

function hasExactName(text, name) {
  const haystack = String(text || "");
  const isWord = (character) => /[A-Za-z0-9_-]/.test(character || "");
  let cursor = 0;
  while ((cursor = haystack.indexOf(name, cursor)) !== -1) {
    const before = haystack[cursor - 1];
    const after = haystack[cursor + name.length];
    if (!isWord(before) && !isWord(after)) return true;
    cursor += name.length;
  }
  return false;
}

export function d1NameIsPresent(text) {
  try {
    const entries = JSON.parse(text);
    return Array.isArray(entries) && entries.some((entry) =>
      entry && typeof entry.name === "string" && entry.name === D1_DATABASE);
  } catch { return null; }
}

function realRunner(args) {
  const executable = process.env.WRANGLER_BIN || "wrangler";
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
    windowsHide: true,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.status === 0 ? String(result.stdout || "") : "",
  };
}

export function inspectReadiness(run = realRunner) {
  const version = run(["--version"]);
  if (!version.ok) return {
    wrangler_available: false,
    authenticated: "unknown",
    pages_project: "unknown",
    d1_database: "unknown",
    secret_names: "unknown",
    limitations: ["Wrangler could not start; no changes made."],
  };
  const auth = run(["whoami"]);
  if (!auth.ok) return {
    wrangler_available: true,
    authenticated: "not_confirmed",
    pages_project: "unknown",
    d1_database: "unknown",
    secret_names: "unknown",
    limitations: ["Wrangler authentication could not be confirmed; no changes made."],
  };
  const project = run(["pages", "project", "list"]);
  const db = run(["d1", "list", "--json"]);
  const secrets = run(["pages", "secret", "list", "--project-name", PROJECT]);
  const names = Object.fromEntries(SECRET_NAMES.map((name) =>
    [name, status(secrets.ok, hasExactName(secrets.stdout, name))]));
  return {
    wrangler_available: true,
    authenticated: "observed",
    pages_project: status(project.ok, hasExactName(project.stdout, PROJECT)),
    d1_database: status(db.ok && d1NameIsPresent(db.stdout) !== null, d1NameIsPresent(db.stdout) === true),
    secret_names: names,
    limitations: [
      "A secret name does not prove that its value is correct.",
      "Plain Pages variables may not appear in the secret-name listing.",
      "Cloudflare Access policy, Pages D1 binding and authenticated isolation remain unverified.",
      "Model billing, concurrent quota SQL and OpenAI conversation E2E remain unverified.",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = inspectReadiness();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.wrangler_available || report.authenticated !== "observed") {
    process.exitCode = 2;
  }
}
