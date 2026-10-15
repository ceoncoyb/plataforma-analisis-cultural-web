# Plataforma de análisis cultural — web pública

Landing, sandbox didáctico y documentación pública del producto. Este repositorio no contiene el MCP privado, credenciales, datos de proyectos, corpus, base D1 ni código de QA57/Zotero.

## Producto

La Plataforma organiza estudios con perfiles configurables por proyecto, fuentes y evidencia localizables, lecturas contrastables, decisiones humanas y auditoría de cobertura. Su ámbito incluye investigación cultural y de medios, UX, investigación cualitativa, servicios/sistemas y perfiles propios. El laboratorio audiovisual es un piloto especializado dentro del producto.

El laboratorio audiovisual importa exportaciones del plugin y conserva el manifiesto fuente, los medios y las decisiones de cotejo en el navegador (`localStorage`). **El código contempla** una copia de las decisiones en D1 `analisis-cultural-lab` mediante API autenticada por Cloudflare Access, con validación de JWT, lista de correos permitidos y separación por usuario/proyecto/revisión; esta funcionalidad remota **no debe presentarse como operativa hasta superar sus pruebas en producción**. No se diseñó para subir medios ni el manifiesto fuente. La demo general (`/demo/`) no escribe en D1.

La ruta `/reversionados/` permite editar borradores, guardar revisiones inmutables localmente y exportar/importar el historial. Incluye una API opcional de D1 para guardar y recuperar versiones bajo Cloudflare Access, con separación por identidad; esa escritura remota no debe anunciarse como operativa hasta verificar Access, `DB` y una prueba autenticada de extremo a extremo. El guardado local siempre queda disponible.

El conector ChatGPT continúa privado para la cuenta propietaria. La D1 prevista para Pages es independiente de la D1 privada del conector y no escribe automáticamente al MCP. La exportación JSON de revisión sigue siendo la ruta explícita de transferencia cuando proceda; no implica sincronización remota activa.

## Ejecutar

Requiere Node.js 20 o posterior. No necesita instalar dependencias de terceros.

```sh
npm test
npm run build
node scripts/preview.mjs
```

El resultado listo para Pages queda en `dist/`.

## Cloudflare Pages

Configura el proyecto Git conectado al repositorio con:

| Ajuste | Valor |
|---|---|
| Rama de producción | `main` |
| Comando de build | `npm run build` |
| Directorio de salida | `dist` |
| Node.js | 20 o posterior |

Cloudflare Pages publica el dominio `*.pages.dev`, reconstruye al recibir commits y crea vistas previas para cambios de ramas/PR. Un dominio propio se conecta después desde Pages si se dispone de su zona DNS.

## D1 y acceso del laboratorio

**Estado documentado, no verificación en vivo:** la [incidencia #12](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/12) registró el 14/10/2026 HTTP 503 en `/api/session` con variables de Cloudflare Access incompletas. Eso no prueba que el estado sea idéntico ahora: no se ha realizado aquí una sesión autenticada de extremo a extremo. La sincronización D1 queda **PENDIENTE DE VERIFICAR**; el sitio público y la demo local son rutas separadas. No introducir corpus privado en la API hasta confirmar identidad, `DB`, aislamiento y reversibilidad en un ensayo no sensible.

La base `analisis-cultural-lab` debe estar enlazada a Pages con la variable `DB`. Protege `https://plataforma-analisis-cultural-web.pages.dev/api/*` con una aplicación Self-hosted de Cloudflare Access y una política Allow limitada a las identidades propietarias. Configura las variables de producción `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` y `CF_ACCESS_ALLOWED_EMAILS` en Pages. Sin las tres variables, la API falla de forma cerrada. Guía paso a paso: [`docs/cloudflare-d1-setup.md`](docs/cloudflare-d1-setup.md).

## Estructura

- `public/`: rutas estáticas, SEO básico, sitemap, icono, privacidad y sandbox.
- `scripts/build.mjs`: copia estática reproducible a `dist/`.
- `tests/site.test.mjs`: valida el flujo transversal, reproducción de medios, límites del producto, privacidad y rutas principales.
- `docs/product-brief.md`: audiencia, alcance y funnel.
- `docs/chatgpt-directory-readiness.md`: preparación para distribución pública del plugin.

## Publicación del plugin

El endpoint privado ya existente no se cambia ni se publica desde esta web. Consulta [los criterios de preparación](docs/chatgpt-directory-readiness.md): autenticar usuarios externos, aislar sus espacios y preparar pruebas/privacidad en una arquitectura pública requiere una revisión separada. No copies secretos ni conectes este repositorio a la D1 privada.

