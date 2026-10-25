import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareContext, MAX_TOTAL_CHARS, MAX_BODY_BYTES, MAX_HISTORY_MESSAGES,
} from "../public/conversacion/context-budget.js";

const turn = (role, content) => ({ role, content });
const bodyBytes = (x) => new TextEncoder().encode(JSON.stringify({ messages: x, consent: true })).length;

test("single prompt is kept verbatim without omission", () => {
  const result = prepareContext([], "Hola, ¿qué observamos?");
  assert.deepEqual(result, { messages: [turn("user", "Hola, ¿qué observamos?")], shortened: false });
});

test("long assistant output remains visible locally but is not resent", () => {
  const full = turn("assistant", "A".repeat(6000));
  const history = [turn("user", "Hola"), full];
  const result = prepareContext(history, "Continúa");
  assert.deepEqual(result.messages, [turn("user", "Continúa")]);
  assert.equal(result.shortened, true);
  assert.equal(history[1].content.length, 6000);
});

test("cumulative 5000-character budget removes older whole turns", () => {
  const history = Array.from({ length: 7 }, (_, i) =>
    turn(i % 2 ? "assistant" : "user", String(i).repeat(900)));
  const result = prepareContext(history, "C".repeat(1000));
  assert.equal(result.shortened, true);
  assert.ok(result.messages.reduce((sum, item) => sum + item.content.length, 0) <= MAX_TOTAL_CHARS);
  assert.deepEqual(result.messages.at(-1), turn("user", "C".repeat(1000)));
  assert.deepEqual(result.messages.slice(0, -1), history.slice(-(result.messages.length - 1)));
});

test("non-ASCII input stays within the API 8192-byte body limit", () => {
  const history = Array.from({ length: 7 }, (_, i) =>
    turn(i % 2 ? "assistant" : "user", "界".repeat(1400)));
  const result = prepareContext(history, "字".repeat(1500));
  assert.ok(bodyBytes(result.messages) <= MAX_BODY_BYTES);
  assert.equal(result.shortened, true);
  assert.equal(result.messages.at(-1).content, "字".repeat(1500));
});

test("at most eight messages are forwarded, newest contiguous suffix only", () => {
  const history = Array.from({ length: 20 }, (_, i) =>
    turn(i % 2 ? "assistant" : "user", String(i)));
  const result = prepareContext(history, "siguiente");
  assert.ok(result.messages.length <= MAX_HISTORY_MESSAGES);
  assert.deepEqual(result.messages.slice(0, -1), history.slice(-7));
  assert.equal(result.shortened, true);
});

test("empty or oversized current prompt is rejected before sending", () => {
  assert.throws(() => prepareContext([], " "), RangeError);
  assert.throws(() => prepareContext([], "x".repeat(1601)), RangeError);
});
