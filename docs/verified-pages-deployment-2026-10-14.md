# Verificación de publicación — Cloudflare Pages

**Fecha:** 14 de octubre de 2026 (Perú)  
**Repositorio:** `ceoncoyb/plataforma-analisis-cultural-web`  
**Dominio de producción:** https://plataforma-analisis-cultural-web.pages.dev/

## Resultado verificado

- Los PR #8 y #9 eliminaron la navegación al antiguo `chatgpt.site`. La portada, demo y laboratorio se comprobaron con enlaces internos de Pages.
- El PR #10 (`fix/demo-local-corpus-pages`) se fusionó el 14 de octubre de 2026 en `main`, commit `7edbae931a1ad2d801a43d6809dcf45eb4e0740e`.
- Prueba del checkout de PR #10 en equipo Windows conectado: `npm test`, **16 pruebas aprobadas, 0 fallidas**. GitHub informó el check de Cloudflare Pages como `pass`.
- La vista previa de PR #10 devolvió HTTP 200 para `/`, `/demo/`, `/laboratorio/` y `/privacy/`. Los recursos estáticos JS/CSS referenciados en `/demo/` devolvieron HTTP 200.
- Tras la fusión, `/demo/` de producción devolvió HTTP 200 y contiene `id="media-files"` y el ejemplo sintético. Su HTML y el de la vista previa de la misma revisión compartieron SHA-256 abreviado `FFF2BE74D685B3B3`, calculado de la respuesta UTF-8 obtenida por HTTPS.

## No demostrado / pendiente

- `/api/session` seguía devolviendo HTTP 503 en producción y en la vista previa; la implementación falla cerrada cuando faltan valores requeridos de Cloudflare Access. No se ha verificado en el panel el estado real de la aplicación Access ni los bindings D1.
- La demo de `/demo/` es una aplicación **local**, independiente de la persistencia protegida del laboratorio audiovisual. No equivale a sincronización con el conector ChatGPT.
- La conversación con OpenAI **no está habilitada** en producción Pages. No se ha verificado una clave de OpenAI instalada como secreto de Cloudflare ni llamadas facturables desde Pages.
- No existe constancia de un servidor MCP remoto público autenticado e instalable para usuarios externos; el conector privado de ChatGPT permanece separado.
- Las decisiones del análisis semiótico requieren revisión autoral. Las pruebas del sitio no certifican el corpus ni una interpretación.

## Alcance y protección de datos

Esta nota recoge únicamente verificaciones públicas y código del repositorio. No publica proyectos privados, identificadores de corpus, datos de usuarios, credenciales ni capturas del panel Cloudflare. Los hashes citados prueban equivalencia del HTML observado, no el estado de bases de datos ni servicios privados.

## Rutas de verificación

- [Demo pública](https://plataforma-analisis-cultural-web.pages.dev/demo/)
- [Laboratorio audiovisual](https://plataforma-analisis-cultural-web.pages.dev/laboratorio/)
- [PR #10](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/pull/10)
- [Auditoría anterior](live-audit-2026-10-13.md)
