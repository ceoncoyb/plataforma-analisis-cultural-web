import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const support = readFileSync(join(root, "public/support/index.html"), "utf8");
const privacy = readFileSync(join(root, "public/privacy/index.html"), "utf8");

test("support page is built with a real public issue destination", () => {
  assert.ok(existsSync(join(root, "dist/support/index.html")));
  assert.match(support, /href="https:\/\/github\.com\/ceoncoyb\/plataforma-analisis-cultural-web\/issues\/new"/);
  assert.match(support, /meta name="viewport"/);
  assert.match(support, /href="#contenido"/);
  assert.match(support, /No ofrece soporte de emergencia/);
});

test("support warns users not to publish private secrets or corpus in GitHub issues", () => {
  assert.match(support, /no incluyas contraseñas, claves API, tokens de sesión, archivos del corpus/i);
  assert.match(support, /no ofrece soporte de emergencia/i);
  assert.doesNotMatch(support, /mailto:|sk-proj-|OPENAI_API_KEY/);
});

test("privacy accurately treats D1 as unverified and offers support route", () => {
  assert.match(privacy, /La lectura, escritura, aislamiento y borrado remotos siguen pendientes de una prueba autenticada en producción/);
  assert.match(privacy, /asociado a la identidad de Access, proyecto y revisión/);
  assert.match(privacy, /href="\/support\/"/);
  assert.doesNotMatch(privacy, /<script[^>]+src="https?:\/\//i);
});
