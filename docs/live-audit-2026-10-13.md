# Auditoría en vivo — Plataforma de análisis cultural

**Fecha de comprobación:** 14 de octubre de 2026, hora de Perú  
**Repositorio:** `ceoncoyb/plataforma-analisis-cultural-web`  
**Alcance:** Sitio Pages público, repositorio y comprobaciones de solo lectura. No equivale a una auditoría de las cuentas Cloudflare u OpenAI.

## Estado

- La portada, `/demo/` y `/laboratorio/` responden HTTP 200. Tras fusionar los PR #8 y #9, las páginas verificadas usan enlaces internos de Pages y ya no contienen el antiguo dominio `chatgpt.site`.
- `npm test`: 15 pruebas pasan. Las pruebas incluyen navegación sin redirecciones, flujos locales del laboratorio y controles de la API simulados.
- La API de laboratorio responde HTTP 503 porque Cloudflare Access no está configurado para esa aplicación. No se verificaron sesiones autenticadas ni lectura/escritura en D1 de producción.
- El código permite persistir borradores en la D1 de Pages cuando Access y el binding están configurados. Los medios permanecen en el navegador; la exportación JSON es el flujo actual entre la web y el conector.
- El conector MCP cultural está disponible en ChatGPT y sus herramientas respondieron a una consulta de lectura. Los detalles de proyectos, revisiones y contenido se omiten deliberadamente de este documento público.
- No hay un puente demostrado que permita a Pages invocar el conector MCP privado. El repositorio tampoco incluye un endpoint conversacional de OpenAI. No se encontró una credencial de API y no se hicieron llamadas facturables.
- No se dispone aquí de acceso al panel Cloudflare ni a Wrangler; por tanto, el estado de Access, bindings, D1 y logs no está auditado desde la cuenta.

## Matriz

| Área | Estado | Evidencia y límite |
|---|---|---|
| Navegación Pages | Verificada en producción | `/`, `/demo/` y `/laboratorio/`: HTTP 200, enlaces internos; pruebas locales 15/15 |
| API de laboratorio | Bloqueada por configuración | `/api/session` y `/api/review-draft` rechazan con HTTP 503 cuando falta la configuración requerida |
| Identidad y D1 reales | No comprobadas | No fue posible autenticarse ni inspeccionar el panel o los datos de producción |
| MCP cultural en ChatGPT | Disponible en esta sesión | Consulta de lectura exitosa; no implica acceso desde Pages |
| Conversación Pages → OpenAI | No implementada | No existe endpoint de IA en el repositorio auditado |
| Pages ↔ MCP | No implementado | El intercambio actual es mediante exportación JSON; no se probó sincronización directa |

## Próximos hitos técnicos

1. Configurar Cloudflare Access para `/api/*` y verificar el binding D1 `DB` en producción.
2. Implementar un servicio backend autorizado que medie el acceso de Pages al motor cultural, con identidad y permisos definidos. No reutilizar sesiones privadas de ChatGPT ni exponer la D1 privada.
3. Decidir la credencial y los límites de facturación de OpenAI Platform antes de habilitar llamadas desde Pages.
4. Cuando exista un endpoint remoto MCP público, validar el flujo de instalación correspondiente. La conexión privada actual de ChatGPT no constituye por sí sola un plugin público instalable.

La segmentación audiovisual se evalúa según las unidades declaradas por cada corpus de prueba; no se fija un número universal de segmentos.
