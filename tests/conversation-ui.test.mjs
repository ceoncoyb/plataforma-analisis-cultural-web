import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "public/conversacion/index.html"), "utf8");
const js = readFileSync(join(root, "public/conversacion/chat.js"), "utf8");
const css = readFileSync(join(root, "public/conversacion/chat.css"), "utf8");

test("Pages conversation route exists, uses same-origin scripts and no direct API secret", () => {
  assert.match(html, /href="\/conversacion\/chat\.css"/);
  assert.match(html, /src="\/conversacion\/chat\.js"/);
  assert.match(html, /href="\/assets\/site\.css"/);
  assert.doesNotMatch(html + js, /api\.openai\.com|OPENAI_API_KEY|chatgpt\.site/);
  assert.doesNotMatch(html, /onclick=|<script[^>]*>\s*[^<\s]/i);
});

test("Only affirmative consent enables sending text", () => {
  assert.match(html, /id="chat-consent" type="checkbox" required/);
  assert.match(html, /id="chat-text"[^>]*maxlength="1600"/);
  assert.match(js, /if \(busy \|\| !consent\.checked\) return/);
  assert.match(js, /credentials: "same-origin"/);
  assert.match(js, /fetch\("\/api\/conversation"/);
});

test("Chat messages are in-memory and rendered as text, never HTML", () => {
  assert.match(js, /const history = \[\]/);
  assert.match(js, /p\.textContent = content/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|innerHTML/);
  assert.match(js, /history\.length = 0/);
  assert.match(html, /aria-live="polite"/);
});

test("Mobile and keyboard accessibility have explicit support", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /role="log"/);
  assert.match(html, /role="status"/);
  assert.match(html, /<label for="chat-text">/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Pages build includes the scoped pilot route", () => {
  assert.ok(existsSync(join(root, "dist/conversacion/index.html")));
  assert.ok(existsSync(join(root, "dist/conversacion/chat.js")));
  assert.ok(existsSync(join(root, "dist/conversacion/chat.css")));
});

test("Never silently retries after a remote failure", () => {
  assert.match(js, /No se reintentó automáticamente/);
  assert.match(js, /if \(!response\.ok\)/);
  assert.match(html, /puls[eé] «Enviar»/);
  assert.match(html, /noindex,nofollow/);
});
