# Piloto de conversación nativo (Cloudflare Pages) — borrador protegido

**Estado:** código propuesto, desactivado por defecto; NO desplegado ni probado con clave facturable. No declarar este backend operativo hasta cumplir los gates indicados aquí y en [issue #13](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/13).

## Endpoint

`POST /api/conversation` — mismo origen de Pages, texto exclusivamente.

- Primero exige `NATIVE_CHAT_ENABLED=true` y `NATIVE_CHAT_BUDGET_ACK=approved`.
- Reutiliza verificación JWT **Cloudflare Access** con audiencia, firma y correo permitidos (`functions/_shared/access.js`). No admite solicitudes anónimas, `Origin` ajeno o sin origen.
- Usa sólo el `OPENAI_API_KEY` secreto del entorno servidor, jamás una clave JavaScript pública; `NATIVE_CHAT_MODEL` debe elegirse y acreditarse expresamente.
- Solicitud JSON: `{"messages":[{"role":"user","content":"Hola"}]}`; admite como máximo ocho mensajes en el historial, de los roles `user`/`assistant`, con último mensaje `user`. Cada contenido es texto de hasta 1.600 caracteres; total 5.000 caracteres, payload máximo 8.192 bytes. No acepta archivos, manifestos, IDs de corpus, `tools`, roles de sistema, ni acciones remotas configurables por el navegador.
- La implementación usa OpenAI **Responses API**, `store:false`, `stream:false`, `tools:[]` y `max_output_tokens` limitado. Fuente: [API Responses oficial](https://developers.openai.com/api/reference/resources/responses/methods/create).
- La entrada completa viaja desde el navegador al backend Cloudflare y de allí a OpenAI **solo si el usuario envía el formulario y se habilitan los gates**; no se conecta a la base privada MCP ni a Tesis/Obsidian/Zotero. El chat no se conserva en D1: solo se guarda el correo Access y el contador de cuota/día para limitar abuso.
- La cuota se reserva en D1 de forma atómica antes de la única llamada API (sin reintentos); la tasa y contador siguen consumidos si el proveedor falla, a favor de la cota de gasto. Sin D1 o con fallo de consulta, se detiene y no llama al modelo.
- Errores del proveedor se ocultan al cliente; no se registran mensajes, API keys ni cuerpos de errores. Este endpoint no ejecuta compras, publica documentos, crea DOI, modifica canon, envía mensajes a terceros ni crea archivos en la plataforma.

## Variables obligatorias (solo servidor/Pages)

| Configuración | Regla |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_ALLOWED_EMAILS` | Cloudflare Access autorizado para este hostname y `/api/*` |
| `DB` | Binding D1 del proyecto Pages, **verificado** |
| `OPENAI_API_KEY` | Secret **de servidor**, con cuenta/proyecto y límites de gasto confirmados |
| `NATIVE_CHAT_MODEL` | ID del modelo explícitamente aprobado para su precio y capacidad |
| `NATIVE_CHAT_DAILY_LIMIT` | Número entero de 1 a 20, máximo de llamadas por identidad y día UTC |
| `NATIVE_CHAT_MAX_OUTPUT_TOKENS` | Entero 64–512; incluye tokens de razonamiento y visibles |
| `NATIVE_CHAT_MIN_INTERVAL_SECONDS` | Entero 30–3.600; separación entre solicitudes del mismo usuario |
| `NATIVE_CHAT_BUDGET_ACK` | `approved` solo tras aprobar y configurar presupuesto de proveedor |
| `NATIVE_CHAT_ENABLED` | `true` solo tras superar todas las pruebas de seguridad y presupuesto |

El límite de solicitudes/tokens **no es equivalente a un límite monetario garantizado**. Antes de habilitar, establecer además el presupuesto y las alertas en el proyecto OpenAI y verificar las tarifas reales del modelo. **Ningún API key, correo real, AUD ni token** debe registrarse en Git, pruebas, capturas o consultas HTTP públicas.

## QA y decisiones de despliegue

1. Ejecutar `npm test`: pruebas sintéticas de Access JWT, origen, cuotas D1, errores, entrada restringida, salida, disabled flag y no exposición de secretos.
2. Verificar Access de Pages y D1 sin datos privados (véase [incidencia #12](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/12)). El 14/10/2026 la API de sesión devolvió 503 según ese ticket; no asumir reparación.
3. Confirmar precios, modelo, límite de gasto y clave de proyecto de OpenAI por un mecanismo de autenticación legítimo. No ejecutar una llamada facturable mientras los parámetros no estén aprobados.
4. Revisar UI accesible y consentimiento explícito (qué texto se envía a OpenAI, límites, cómo borrar historial local, fallos de red y falta de sesión).
5. Previsualización protegida y pruebas negativas con dos identidades, cuenta sin permiso, origen ajeno, solicitud demasiado grande, cuota excedida, modelo fallido. Probar reversión: `NATIVE_CHAT_ENABLED=false`.
6. Solo entonces realizar una llamada E2E autenticada y aprobada. Registrar resultados sin contenido privado y mantener PR como borrador hasta aprobación del dueño.

**Advertencia:** El código de conversación es un piloto opt-in propio de Pages; no se ha convertido en aplicación ChatGPT pública ni se debe redirigir al sitio histórico `chatgpt.site`. El conector privado sigue separado.
