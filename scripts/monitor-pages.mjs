import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const ORIGIN = "https://plataforma-analisis-cultural-web.pages.dev";
const pages = [
  ["/", ["Sigue cada hallazgo", 'href="/demo/"']],
  ["/demo/", ['id="media-files"', "Una ficha sintética"]],
  ["/laboratorio/", ['id="manifest-file"', 'src="/laboratorio/lab.js"']],
  ["/privacy/", ['name="description"']],
  ["/support/", ["Reporta un problema reproducible", 'href="https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/new"']],
];
const protectedApis = ["/api/session", "/api/review-draft"];
const legacyLink = /\b(?:href|src)\s*=\s*["']https?:\/\/[^"']*chatgpt\.site/i;

// Accept only plausible Cloudflare Access redirects without following them.
// An unrelated destination must never be mistaken for a valid login route.
function validAccessRedirect(location, origin) {
  if (!location) return false;
  try {
    const destination = new URL(location, origin);
    const team = destination.hostname.endsWith(".cloudflareaccess.com")
      && destination.hostname.length > ".cloudflareaccess.com".length;
    const ownAccess = destination.origin === origin
      && destination.pathname.startsWith("/cdn-cgi/access/");
    return destination.protocol === "https:" && !destination.username && !destination.password
      && (team || ownAccess);
  } catch { return false; }
}

export async function auditPages({ fetchImpl = fetch, origin = ORIGIN } = {}) {
  const errors = [], warnings = [], checks = [];
  const root = new URL(origin).origin;
  async function get(path) {
    try {
      return await fetchImpl(root + path, {
        redirect: "manual",
        headers: { "user-agent": "Cultural-Pages-GitHub-Healthcheck/1.0", accept: "text/html,application/json" },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      errors.push(path + ": network error (" + (error?.name || "unknown") + ")");
      checks.push({ path, status: "network-error" });
      return null;
    }
  }

  for (const [path, markers] of pages) {
    const response = await get(path);
    if (!response) continue;
    checks.push({ path, status: response.status });
    if (response.status !== 200) {
      errors.push(path + ": expected HTTP 200, got " + response.status);
      continue;
    }
    const html = await response.text();
    for (const marker of markers)
      if (!html.includes(marker)) errors.push(path + ": missing expected marker " + marker);
    if (legacyLink.test(html)) errors.push(path + ": legacy external chatgpt.site link found");

    if (path === "/demo/") {
      const assets = [...html.matchAll(/(?:href|src)="(\/assets\/site\.[a-f0-9]{12}\.(?:css|js))"/g)].map((m) => m[1]);
      if (new Set(assets).size < 2) {
        errors.push(path + ": fingerprinted CSS and JS are missing");
      } else {
        for (const asset of new Set(assets)) {
          const reply = await get(asset);
          if (!reply) continue;
          checks.push({ path: asset, status: reply.status });
          if (reply.status !== 200) errors.push(asset + ": expected HTTP 200, got " + reply.status);
        }
      }
    }
  }

  for (const path of protectedApis) {
    const response = await get(path);
    if (!response) continue;
    checks.push({ path, status: response.status });
    if (response.status === 503) {
      warnings.push(path + ": HTTP 503 (known configuration blocker, not a healthy API)");
    } else if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (validAccessRedirect(response.headers.get("location"), root)) {
        warnings.push(path + ": authentication redirect not followed; login not verified");
      } else {
        errors.push(path + ": unexpected or unsafe authentication redirect");
      }
    } else if ([401, 403].includes(response.status)) {
      warnings.push(path + ": anonymous request denied; authenticated flow not verified");
    } else if (response.status === 200) {
      errors.push(path + ": anonymous request unexpectedly received HTTP 200");
    } else {
      errors.push(path + ": unexpected anonymous HTTP " + response.status);
    }
  }
  // Never perform a billable provider POST or assume a GET 404 proves a POST-only endpoint absent.
  return { ok: errors.length === 0, checks, errors, warnings };
}

async function main() {
  const report = await auditPages();
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = report.checks.map((c) => "| " + c.path.replaceAll("|", "") + " | " + c.status + " |").join("\n");
    const notes = report.warnings.map((w) => "- " + w).join("\n");
    const failures = report.errors.map((e) => "- " + e).join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "## Cloudflare Pages public health\n\n| Path | HTTP |\n|---|---|\n" + rows +
      "\n\n### Configuration boundaries\n" + (notes || "- None") +
      "\n\n### Regressions\n" + (failures || "- None") + "\n");
  }
  if (!report.ok) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
