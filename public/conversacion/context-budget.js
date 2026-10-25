// Shared browser/Node input budget. Keep the latest user prompt intact; omit a
// contiguous prefix of older turns rather than silently truncating a quotation.
export const MAX_HISTORY_MESSAGES = 8;
export const MAX_CHARS_PER_MESSAGE = 1600;
export const MAX_TOTAL_CHARS = 5000;
export const MAX_BODY_BYTES = 8192;

export function prepareContext(history, prompt) {
  if (!Array.isArray(history) || typeof prompt !== "string"
      || !prompt.trim() || prompt.length > MAX_CHARS_PER_MESSAGE) {
    throw new RangeError("The current message must be nonempty and at most 1600 characters.");
  }
  const latest = { role: "user", content: prompt };
  const selected = [];
  let chars = prompt.length;
  for (let i = history.length - 1; i >= 0 && selected.length < MAX_HISTORY_MESSAGES - 1; i--) {
    const turn = history[i];
    if (!turn || !["user", "assistant"].includes(turn.role)
        || typeof turn.content !== "string" || !turn.content.trim()
        || turn.content.length > MAX_CHARS_PER_MESSAGE
        || chars + turn.content.length > MAX_TOTAL_CHARS) break;

    const candidate = [turn, ...selected, latest];
    if (new TextEncoder().encode(JSON.stringify({
      messages: candidate, consent: true,
    })).byteLength > MAX_BODY_BYTES) break;
    selected.unshift(turn);
    chars += turn.content.length;
  }
  const messages = [...selected, latest];
  return {
    messages,
    shortened: selected.length < history.length,
  };
}
