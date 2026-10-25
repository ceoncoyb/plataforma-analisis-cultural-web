# Diagnóstico Wrangler de solo lectura — Pages, Access y D1

**Estado:** herramienta diagnóstica, no activación. Ninguna operación muta Pages, D1, Access o secretos. No crea proyectos ni invoca OpenAI.

## Ejecución con una sesión legítimamente autenticada

```sh
node scripts/cloudflare-readiness.mjs
```

Si Wrangler está instalado fuera de `PATH`, definir `WRANGLER_BIN` con la ruta **existente y autorizada** de `wrangler`/`wrangler.cmd` y volver a ejecutar. No instalar a ciegas ni mover credenciales entre perfiles.

La herramienta hace únicamente estas consultas del CLI:

- `wrangler --version` y `wrangler whoami`, sin mostrar la salida original.
- `wrangler pages project list`, para detectar el nombre público del proyecto.
- `wrangler d1 list --json`, para cotejar el nombre de D1 sin publicar su UUID.
- `wrangler pages secret list --project-name plataforma-analisis-cultural-web`, solo para detectar **nombres** de secretos, no sus valores.

El informe utiliza `observed`, `not_observed` y `unknown`. **No observado no significa que el valor no exista**: las variables normales de Pages pueden no aparecer en el listado de secretos. La autenticación se comprueba por estado de salida y nunca se muestra el correo, ID de cuenta, token ni mensaje completo del CLI.

### Límites de esta comprobación

1. No verifica si Cloudflare Access realmente protege `/api/*`, si el JWT del usuario es válido o si hay una política de correos permitidos.
2. No prueba que `DB` esté vinculado al entorno **Production** de Pages, ni que D1 aísle cuentas, proyectos o revisiones.
3. No prueba SQL de cuota con peticiones concurrentes ni retención/borrado de contadores; esas pruebas deben realizarse con datos **sintéticos** en un entorno legitimamente autorizado.
4. No verifica presupuesto/cargos reales de OpenAI, la validez del nuevo secreto ni la disponibilidad del modelo.
5. No modifica `NATIVE_CHAT_ENABLED` ni `NATIVE_CHAT_BUDGET_ACK` y nunca ejecuta `POST /api/conversation`.

### Estado operativo observado (14/10/2026)

La instalación autenticada **sí fue localizada** en el directorio de trabajo `AI_ROUTER_STACK/project-hub/sovereign-hub/cloudflare` (instalación local dentro de `node_modules/.bin`, no necesariamente en `PATH`). No se requiere SMS para reutilizar una sesión CLI ya autorizada y vigente; esto no permite eludir requisitos de autenticación de otro canal.

Comprobaciones reales, sin valores privados:

- `wrangler whoami`, `pages project list`, `d1 list --json` y `pages secret list` se completaron correctamente. El nombre `OPENAI_API_KEY` está registrado como secreto, sin verificar su contenido.
- `d1 execute analisis-cultural-lab --remote --command 'SELECT 1 AS readiness_probe' --json` funcionó; la existencia de una base no demuestra por sí sola un binding en Pages.
- `pages project list --json` devolvió una lista resumida con columnas **Project Name**, **Project Domains**, **Git Provider** y **Last Modified**. **No incluye los bindings de Production**.
- `wrangler pages download config plataforma-analisis-cultural-web` se ejecutó en una carpeta temporal aislada y descargó un `wrangler.toml`. Su estructura incluyó `[[env.production.d1_databases]]` y una declaración de `binding = "DB"`. La descarga temporal se destruyó al terminar; no se desplegó ni se cambió configuración.
- La descarga no incluyó nombres de Access. Tampoco incluyó el nombre del secreto `OPENAI_API_KEY` ya constatado por separado. **No se debe inferir que un valor no existe por su ausencia del archivo descargado**.
- Las rutas públicas `/api/session` y `/api/review-draft` todavía no cuentan con una sesión Access probada; su último resultado sin autenticación fue HTTP 503.

### Herramienta adicional: verificar la estructura de Production

```sh
node scripts/cloudflare-production-binding.mjs
```

El nuevo diagnóstico ejecuta solo `pages download config` desde una carpeta temporal del sistema, analiza el ámbito **Production** y borra la copia tanto si la consulta tiene éxito como si falla. Reconoce nombres `DB` y `analisis-cultural-lab` dentro del mismo bloque TOML, sin mostrar IDs, correos ni valores. Devuelve `observed`, `not_observed` o `unknown`; no representa una prueba E2E ni autoriza activar OpenAI. Si el ejecutable no figura en `PATH`, señalar mediante `WRANGLER_BIN` la ruta local autorizada de `wrangler.cmd` (sin copiar tokens).

**Pendiente de prueba real:** autorización por JWT, variables Access del entorno efectivo, lectura-escritura-borrado de borrador sintético, política de aislamiento, presupuesto y modelo OpenAI. No mezclar autenticación de Wrangler con login de usuario de Pages.

**Dependencias propietarias:** issues [#12](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/12) (Access/D1), [#13](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/13) (OpenAI) y [#14](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/14) (MCP público).

Fuentes de comandos: [Wrangler Pages](https://developers.cloudflare.com/workers/wrangler/commands/pages/) y [Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/).
