# Plataforma de análisis cultural — web pública

Landing, sandbox didáctico y documentación pública del producto. Este repositorio no contiene el MCP privado, credenciales, datos de proyectos, corpus, base D1 ni código de QA57/Zotero.

## Producto

La Plataforma organiza estudios con perfiles configurables por proyecto, fuentes y evidencia localizables, lecturas contrastables, decisiones humanas y auditoría de cobertura. Su ámbito incluye investigación cultural y de medios, UX, investigación cualitativa, servicios/sistemas y perfiles propios. El laboratorio audiovisual es un piloto especializado dentro del producto.

El laboratorio audiovisual importa exportaciones del plugin, mantiene el manifiesto fuente y los medios en el navegador, y conserva las decisiones humanas de cotejo en `localStorage` y en la D1 `analisis-cultural-lab` del proyecto Pages. La API Pages solo acepta solicitudes autenticadas por Cloudflare Access, valida el JWT, restringe el correo a una lista permitida y separa los borradores por usuario, proyecto y revisión. No sube medios ni el manifiesto fuente. El endpoint crea la tabla de revisión si aún no existe. La demo general (`/demo/`) continúa usando almacenamiento local y no escribe en D1.

El conector ChatGPT continúa privado para la cuenta propietaria. La D1 de Pages respalda las revisiones del laboratorio; no es la D1 privada del conector ni escribe automáticamente al MCP. La exportación de revisión sigue disponible para transferir resultados al plugin mediante su flujo autorizado.

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

La base `analisis-cultural-lab` debe estar enlazada a Pages con la variable `DB`. Protege `https://plataforma-analisis-cultural-web.pages.dev/api/*` con una aplicación Self-hosted de Cloudflare Access y una política Allow limitada a las identidades propietarias. Configura las variables de producción `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` y `CF_ACCESS_ALLOWED_EMAILS` en Pages. Sin las tres variables, la API falla de forma cerrada. Guía paso a paso: [`docs/cloudflare-d1-setup.md`](docs/cloudflare-d1-setup.md).

## Estructura

- `public/`: rutas estáticas, SEO básico, sitemap, icono, privacidad y sandbox.
- `scripts/build.mjs`: copia estática reproducible a `dist/`.
- `tests/site.test.mjs`: valida el flujo transversal, reproducción de medios, límites del producto, privacidad y rutas principales.
- `docs/product-brief.md`: audiencia, alcance y funnel.
- `docs/chatgpt-directory-readiness.md`: preparación para distribución pública del plugin.

## Publicación del plugin

El endpoint privado ya existente no se cambia ni se publica desde esta web. Consulta [los criterios de preparación](docs/chatgpt-directory-readiness.md): autenticar usuarios externos, aislar sus espacios y preparar pruebas/privacidad en una arquitectura pública requiere una revisión separada. No copies secretos ni conectes este repositorio a la D1 privada.

