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

En el equipo Windows conectado no se encontró el comando `wrangler` en `PATH`; la invocación de prueba mediante `npx --yes wrangler --version` falló con `npm EBUSY`. No se repitió la instalación ni se intentó acceder a archivos fuera de las carpetas autorizadas. El usuario señala que Wrangler está disponible en su entorno, pero **esa instalación o autenticación concreta aún no se localizó** en la sesión remota. Los indicadores de Cloudflare por cuenta permanecen `unknown`.

**Dependencias propietarias:** issues [#12](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/12) (Access/D1), [#13](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/13) (OpenAI) y [#14](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/14) (MCP público).

Fuentes de comandos: [Wrangler Pages](https://developers.cloudflare.com/workers/wrangler/commands/pages/) y [Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/).
