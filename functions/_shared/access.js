const encoder = new TextEncoder();
let cachedKeys = null;
let cachedIssuer = "";
let cachedAt = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function decodePart(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
}

function decodeSignature(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function accessIssuer(raw) {
  const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".cloudflareaccess.com") || url.pathname !== "/")
    throw new Error("Invalid Cloudflare Access team domain");
  return url.origin;
}

async function signingKeys(issuer) {
  if (cachedKeys && cachedIssuer === issuer && Date.now() - cachedAt < 10 * 60 * 1000) return cachedKeys;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Could not retrieve Cloudflare Access signing keys");
  const payload = await response.json();
  if (!Array.isArray(payload.keys)) throw new Error("Cloudflare Access key set is malformed");
  cachedKeys = payload.keys;
  cachedIssuer = issuer;
  cachedAt = Date.now();
  return cachedKeys;
}

export async function requireAccess(request, env) {
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  const audience = String(env.CF_ACCESS_AUD || "").trim();
  const allowedEmails = String(env.CF_ACCESS_ALLOWED_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!teamDomain || !audience || !allowedEmails.length)
    return { response: json({ error: "Cloudflare Access is not configured for the thesis lab." }, 503) };
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { response: json({ error: "Cloudflare Access authentication is required." }, 401) };
  try {
    const issuer = accessIssuer(teamDomain);
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed JWT");
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unexpected signing algorithm");
    if (claims.iss !== issuer) throw new Error("Issuer does not match");
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) throw new Error("Audience does not match");
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || claims.exp <= now || (Number.isFinite(claims.nbf) && claims.nbf > now + 30))
      throw new Error("Token is expired or not yet valid");
    const jwk = (await signingKeys(issuer)).find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) throw new Error("Signing key is unknown");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, decodeSignature(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error("Token signature is invalid");
    const email = String(claims.email || "").trim().toLowerCase();
    if (!email || !allowedEmails.includes(email)) return { response: json({ error: "This Cloudflare identity is not authorized for the thesis lab." }, 403) };
    return { identity: { email } };
  } catch {
    return { response: json({ error: "Cloudflare Access authentication could not be verified." }, 403) };
  }
}

export { json };
