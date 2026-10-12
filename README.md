# Plataforma de análisis cultural — web pública

Landing, sandbox didáctico y documentación pública del producto. Este repositorio no contiene el MCP privado, credenciales, datos de proyectos, corpus, base D1 ni código de QA57/Zotero.

## Producto

La Plataforma organiza estudios con perfiles configurables por proyecto, fuentes y evidencia localizables, lecturas contrastables, decisiones humanas y auditoría de cobertura. Su ámbito incluye investigación cultural y de medios, UX, investigación cualitativa, servicios/sistemas y perfiles propios. El laboratorio audiovisual es un piloto especializado dentro del producto.

El laboratorio funciona en el navegador para proyectos configurables. Permite importar fichas locales anteriores, el formato audiovisual del Site y proyectos MCP `schema_version: 1`; cargar medios locales, marcar intervalos y registrar observaciones. El botón «Preparar proyecto para ChatGPT» crea una copia compatible con `import_project` para continuar mediante importación manual como proyecto nuevo. No hay sincronización automática ni escritura directa desde la web. Las fichas se guardan en `localStorage`; los medios no se suben ni se incluyen. Una hipótesis local se conserva como nota provisional, no como lectura validada.

El conector ChatGPT continúa privado para la cuenta propietaria; visitantes sin acceso pueden probar y exportar la demo, pero no importar al espacio privado. Esta web no altera la identidad, permisos, endpoint, D1 o datos del conector.

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

## Estructura

- `public/`: rutas estáticas, SEO básico, sitemap, icono, privacidad y sandbox.
- `scripts/build.mjs`: copia estática reproducible a `dist/`.
- `tests/site.test.mjs`: valida el flujo transversal, reproducción de medios, límites del producto, privacidad y rutas principales.
- `docs/product-brief.md`: audiencia, alcance y funnel.
- `docs/chatgpt-directory-readiness.md`: preparación para distribución pública del plugin.

## Publicación del plugin

El endpoint privado ya existente no se cambia ni se publica desde esta web. Consulta [los criterios de preparación](docs/chatgpt-directory-readiness.md): autenticar usuarios externos, aislar sus espacios y preparar pruebas/privacidad en una arquitectura pública requiere una revisión separada. No copies secretos ni conectes este repositorio a la D1 privada.
