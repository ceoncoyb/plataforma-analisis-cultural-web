import { requireAccess, json } from "../_shared/access.js";

const BODY_LIMIT = 8_192;
const MAX_MESSAGES = 8;
const MAX_CHARS_PER_MESSAGE = 1_600;
const MAX_TOTAL_CHARS = 5_000;
const QUOTA_TABLE = `CREATE TABLE IF NOT EXISTS native_chat_quota (
  user_email TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  last_request_ms INTEGER NOT NULL,
  PRIMARY KEY(user_email, utc_day)
)`;
const QUOTA_SQL = `INSERT INTO native_chat_quota
  (user_email, utc_day, request_count, last_request_ms)
  VALUES (?, ?, 1, ?)
  ON CONFLICT(user_email, utc_day) DO UPDATE SET
    request_count = native_chat_quota.request_count + 1,
    last_request_ms = excluded.last_request_ms
  WHERE native_chat_quota.request_count < ?
    AND native_chat_quota.last_request_ms <= ?
  RETURNING request_count`;

function isEnabled(env) {
  return env.NATIVE_CHAT_ENABLED === "true"
    && env.NATIVE_CHAT_BUDGET_ACK === "approved";
}

function boundedInteger(value, min, max) {
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max ? num : null;
}

function sameOrigin(request) {
  try {
    return request.headers.get("origin") === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function validateMessages(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  // No files, tools, provider keys, models, redirects or system instructions may be supplied by the browser.
  if (Object.keys(input).length !== 2 || input.consent !== true || !Array.isArray(input.messages)
      || input.messages.length < 1 || input.messages.length > MAX_MESSAGES) return null;
  let size = 0;
  const messages = [];
  for (const m of input.messages) {
    if (!m || typeof m !== "object" || Array.isArray(m)
        || Object.keys(m).length !== 2
        || !["user", "assistant"].includes(m.role)
        || typeof m.content !== "string" || !m.content.trim()
        || m.content.length > MAX_CHARS_PER_MESSAGE) return null;
    size += m.content.length;
    if (size > MAX_TOTAL_CHARS) return null;
    messages.push({ role: m.role, content: m.content });
  }
  // Browser-provided history is deliberately bounded and must end with a user prompt.
  return messages[messages.length - 1].role === "user" ? messages : null;
}

async function reserveRequest(db, email, dailyLimit, waitSeconds) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  await db.prepare(QUOTA_TABLE).run();
  const res = await db.prepare(QUOTA_SQL)
    .bind(email, today, now, dailyLimit, now - waitSeconds * 1000).first();
  return Boolean(res && Number.isInteger(res.request_count) && res.request_count > 0);
}

function onlyOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim().slice(0, 8_000);
  }
  if (!Array.isArray(data?.output)) return "";
  return data.output
    .filter((item) => item?.type === "message" && item?.role === "assistant"
      && Array.isArray(item.content))
    .flatMap((item) => item.content.filter((part) => part?.type === "output_text"
      && typeof part.text === "string").map((part) => part.text))
    .join("\n").trim().slice(0, 8_000);
}

export async function onRequestPost({ request, env }) {
  if (!isEnabled(env)) return json({ error: "Conversation pilot is disabled." }, 503);
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  if (!sameOrigin(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return json({ error: "Expected application/json." }, 415);
  const model = String(env.NATIVE_CHAT_MODEL || "").trim();
  const key = String(env.OPENAI_API_KEY || "").trim();
  const dailyLimit = boundedInteger(env.NATIVE_CHAT_DAILY_LIMIT, 1, 20);
  const outputTokens = boundedInteger(env.NATIVE_CHAT_MAX_OUTPUT_TOKENS, 64, 512);
  const waitSeconds = boundedInteger(env.NATIVE_CHAT_MIN_INTERVAL_SECONDS, 30, 3600);
  if (!model || !/^[A-Za-z0-9._-]{3,80}$/.test(model) || !key
      || !dailyLimit || !outputTokens || !waitSeconds
      || !env.DB || typeof env.DB.prepare !== "function")
    return json({ error: "Conversation budget, credentials or D1 are not configured." }, 503);
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declaredSize) || declaredSize > BODY_LIMIT)
    return json({ error: "Request exceeds maximum size." }, 413);
  let input;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT)
      return json({ error: "Request exceeds maximum size." }, 413);
    input = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }
  const messages = validateMessages(input);
  if (!messages) return json({ error: "Only bounded text history ending in a user message is accepted." }, 400);
  try {
    const reserved = await reserveRequest(env.DB, auth.identity.email, dailyLimit, waitSeconds);
    if (!reserved) return json({ error: "Daily quota or minimum request interval reached." }, 429);
  } catch {
    return json({ error: "Conversation quota could not be verified." }, 503);
  }
  // Single provider call; no retries or background jobs. No originals, media, files or private corpus sync.
  let provider;
  try {
    provider = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: messages,
        max_output_tokens: outputTokens,
        store: false,
        stream: false,
        tools: [],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return json({ error: "Model provider is unavailable." }, 502);
  }
  if (!provider.ok) return json({ error: "Model provider did not complete the request." }, 502);
  try {
    const data = await provider.json();
    if (data?.status !== "completed" || data.incomplete_details)
      return json({ error: "Model response is incomplete or not finalized." }, 502);
    const reply = onlyOutputText(data);
    if (!reply) return json({ error: "Model response did not include usable text." }, 502);
    return json({ reply, storage: "browser_only", external_provider: "OpenAI Responses API",
      status: "text_only_pilot" });
  } catch {
    return json({ error: "Model response could not be processed." }, 502);
  }
}

export { validateMessages, onlyOutputText };
