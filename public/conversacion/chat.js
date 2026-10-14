// Own-origin text-only pilot. No secrets, files, localStorage or automatic requests.
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-text");
const consent = document.getElementById("chat-consent");
const status = document.getElementById("chat-status");
const historyView = document.getElementById("chat-history");
const empty = document.getElementById("empty-chat");
const remaining = document.getElementById("remaining");
const send = document.getElementById("send-chat");
const clear = document.getElementById("clear-chat");
const history = [];
let busy = false;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}

function addMessage(role, content) {
  if (empty) empty.hidden = true;
  const node = document.createElement("article");
  node.className = "chat-message";
  node.dataset.role = role;
  const heading = document.createElement("strong");
  heading.textContent = role === "user" ? "Tú" : "Respuesta";
  const p = document.createElement("p");
  p.textContent = content; // Never interpret user or model output as HTML.
  node.append(heading, p);
  historyView.append(node);
  historyView.scrollTop = historyView.scrollHeight;
}

function updateCount() {
  remaining.textContent = `${input.value.length} de 1600 caracteres`;
}

input.addEventListener("input", updateCount);
clear.addEventListener("click", () => {
  if (busy) return;
  history.length = 0;
  historyView.querySelectorAll(".chat-message").forEach((node) => node.remove());
  if (empty) empty.hidden = false;
  input.value = "";
  consent.checked = false;
  updateCount();
  setStatus("Historial de esta pestaña borrado. No se envió ninguna solicitud.");
  input.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !consent.checked) return;
  const text = input.value.trim();
  if (!text || text.length > 1600) {
    setStatus("Escribe un mensaje de máximo 1600 caracteres.", true);
    return;
  }
  const outgoing = [...history.slice(-7), { role: "user", content: text }];
  busy = true;
  send.disabled = true;
  setStatus("Validando acceso, cuota y disponibilidad…");
  try {
    const response = await fetch("/api/conversation", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: outgoing }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const errors = {
        400: "El mensaje supera los límites o no tiene el formato permitido.",
        401: "Es necesario iniciar sesión con Cloudflare Access.",
        403: "Esta sesión no está autorizada o la solicitud no proviene del mismo origen.",
        413: "El mensaje supera el tamaño permitido.",
        429: "Se alcanzó el límite de solicitudes. Espera antes de volver a enviar.",
        503: "El piloto está desactivado o su configuración segura está incompleta.",
      };
      setStatus(errors[response.status] || "No se pudo completar la solicitud. El texto permanece aquí.", true);
      return;
    }
    const payload = await response.json();
    if (typeof payload?.reply !== "string" || !payload.reply.trim()) {
      setStatus("La respuesta del servidor no contiene texto válido.", true);
      return;
    }
    history.push({ role: "user", content: text }, { role: "assistant", content: payload.reply });
    addMessage("user", text);
    addMessage("assistant", payload.reply);
    input.value = "";
    updateCount();
    setStatus("Respuesta recibida. No se guardó un historial de conversación en D1.");
  } catch {
    setStatus("No se pudo establecer conexión. No se reintentó automáticamente.", true);
  } finally {
    busy = false;
    send.disabled = false;
  }
});
updateCount();
