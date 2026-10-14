# Auditoría en vivo — Plataforma de análisis cultural

**Fecha de comprobación:** 13 de octubre de 2026, hora de Perú  
**Repositorio:** `ceoncoyb/plataforma-analisis-cultural-web`  
**HEAD observado:** `2069d59d836716ff7c9b15fc2059f47ee9313c60` — `Fix imported frame hierarchy and timestamps`  
**Alcance:** Pages y repositorio públicos, más una consulta de solo lectura al conector privado de análisis cultural disponible en esta sesión. No equivale a una auditoría de cuenta Cloudflare.

## Resultado ejecutivo

La web de Cloudflare Pages y la ruta del laboratorio responden HTTP 200. El repositorio está en `main`, limpio al iniciar la revisión y sus pruebas pasaron (14/14 antes de esta corrección). La API del laboratorio rechaza en forma cerrada las solicitudes sin configuración de Cloudflare Access: las rutas `/api/session` y `/api/review-draft` devuelven HTTP 503 con `Cloudflare Access is not configured for the thesis lab.` Por ello no se comprobó lectura ni escritura en D1 desde producción.

La documentación y el código confirman que los borradores de revisión pueden persistirse en D1 cuando Access y el binding estén configurados, mientras los medios permanecen locales. La exportación JSON es la vía actual de transferencia desde la web. **Corrección:** la inspección inicial no detectó el conector privado; una consulta posterior confirmó que sí está conectado a este ChatGPT y que sus herramientas de proyecto están disponibles en esta sesión. Su lista en vivo incluye `tesis-oncoy-y-2026-v5`, revisión 326, con 103 unidades, 130 evidencias y 27 lecturas. No existe evidencia de que Pages pueda invocar ese conector directamente. Tampoco hay herramientas de Cloudflare en esta sesión para verificar el panel o desplegar.

## Matriz de comprobación

| Componente | Recurso real | Estado | Evidencia | Problema / alcance | Cambio ejecutado | Prueba posterior |
|---|---|---|---|---|---|---|
| A. Frontend publicado | Pages `plataforma-analisis-cultural-web.pages.dev` | VERIFICADO | GET de `/` y `/laboratorio/`: HTTP 200; cabeceras CSP y seguridad presentes | Solo comprobación HTTP, sin sesión de propietario | Ninguno | Mismas rutas HTTP 200 |
| B. Frontend → API real | Functions `/api/session`, `/api/review-draft` | PARCIAL | Ambas rutas responden JSON y aplican control previo | La API existe, pero no permite pasar al flujo autenticado por faltar configuración | Ninguno | Respuestas HTTP 503, falla cerrada |
| C. Identidad real | Cloudflare Access | BLOQUEADO | API indica configuración Access ausente | No se pudo validar una sesión real ni rechazar una sesión desde la cuenta Cloudflare | Ninguno | Prueba local JWT y rechazo de no autenticado sí pasa; no es prueba de producción |
| D. API → D1 | Binding `DB`, D1 `analisis-cultural-lab` | NO_COMPROBADO | Documentado en `docs/cloudflare-d1-setup.md`; API exige binding | La configuración efectiva y filas no son visibles; Access incompleto | Ninguno | Pruebas locales con D1 simulada pasan, sin certificar D1 real |
| E. Web → OpenAI | Responses API / servicio del lado servidor | AUSENTE | No hay endpoint de IA en el repo revisado | No se encontró clave, servicio conectado ni configuración de gateway; no se hizo llamada facturable | Ninguno | No comprobado |
| F. ChatGPT → herramientas culturales | Plugin MCP privado | VERIFICADO EN CHATGPT | La herramienta `list_projects` responde y muestra la revisión viva 326 de Tesis ONCOY v5 | No prueba conexión desde Pages ni disponibilidad de sus datos fuera de ChatGPT | Ninguno | Lectura de lista de proyectos; sin escritura |
| G. Acciones web reflejadas en MCP | Servicio cultural autorizado | AUSENTE | README y guía D1 especifican exportación JSON manual | Sin API o sincronización bidireccional demostrada | Ninguno | No comprobado |
| H. Identidad/revisiones coherentes entre sistemas | Web D1 y proyecto `tesis-oncoy-y-2026-v5` | PARCIAL | Plugin informa en vivo revisión 326, 103 unidades, 130 evidencias y 27 lecturas | No se pudo cotejar el mismo conjunto de IDs con la D1 web, que sigue bloqueada por Access | Ninguno | La API web devuelve 503; no se modificó el proyecto |
| Navegación Pages sin redirección | Portada, demo y laboratorio | DESPLEGADO EN PRODUCCIÓN | Tras merge de PR #8 y PR #9, las tres rutas devuelven HTTP 200 y no contienen el dominio `chatgpt.site` al verificar con URL de caché nueva | Un GET sin parámetro de caché siguió mostrando por unos instantes la respuesta anterior en la ruta audiovisual | Todos los CTAs públicos quedaron en rutas internas Pages | `npm test`: 15/15; verificación HTTP con parámetro único para `/`, `/demo/` y `/laboratorio/` |
| Laboratorio audiovisual y segmentación | `/laboratorio/`, `public/laboratorio/multimodal-review.mjs` | VERIFICADO EN CÓDIGO | Incluye jerarquía de secuencias, segmentos, intervalos y fotogramas; conserva los padres declarados y tolera proyectos sin subsecuencias | No se cargó un manifiesto vivo de Tesis UPN en esta sesión; controles humanos y medios locales | Criterio de cobertura actualizado para corpus dinámico, sin número fijo | Suite local: importación y agrupación jerárquica pasan |

## Verificación técnica

- Git remoto accesible; rama principal `main`; HEAD indicado arriba; árbol limpio antes de esta actualización.
- El conector GitHub identifica el repositorio público y permisos administrativos/push del usuario. Esto no prueba configuración ni despliegues de Cloudflare.
- La consulta de solo lectura al plugin conectado devolvió la revisión y los conteos indicados en la tabla. No se ejecutaron escrituras.
- Remote Desktop Commander reporta el equipo `DESKTOP-6KUULDG` en línea; no fue necesario operar la computadora para las comprobaciones del repositorio público.
- `npm test`: 15 pruebas pasaron, 0 fallidas tras esta actualización. Incluye pruebas de JWT simulado, aislamiento por usuario/proyecto/revisión, rechazo de identidad ausente, CORS, límites de datos, flujos locales del laboratorio y ausencia de enlaces públicos al Site antiguo.
- Inspección HTTP directa: las dos páginas sirven; las APIs devuelven 503 por configuración de Access ausente. No se afirmó acceso a D1 ni a sistemas privados.
- Los PR #8 y #9 se fusionaron después de pasar las pruebas. Cloudflare Pages publicó los cambios automáticamente; no se ejecutaron migraciones ni escrituras de datos y no se generaron gastos de API.

## Corrección metodológica

Se sustituyó el criterio fijo de `28/28` unidades por cobertura del 100 % de las unidades declaradas en cada corpus de prueba, con recuentos calculados a partir de su estructura. La cobertura audiovisual incluye todas las secuencias, intervalos, fotogramas y otras unidades que realmente estén declaradas. La segmentación permanece variable y revisable por humanos.

## Bloqueos externos concretos

1. Configurar Cloudflare Access en `/api/*` con la identidad propietaria y las variables documentadas (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_ALLOWED_EMAILS`); verificar el binding D1 `DB`.
2. Acceso al panel/conector Cloudflare en esta sesión para corroborar configuración, despliegues, D1 y logs.
3. Aunque el plugin se encuentra conectado dentro de ChatGPT, falta un puente de servidor a servidor autorizado para que Pages invoque sus capacidades. Las credenciales/sesión del plugin no se pueden exportar desde este cliente; hace falta un endpoint/servicio cultural autorizado con permisos explícitos de lectura y escritura.
4. Credencial de plataforma API de OpenAI y confirmación de facturación/límites para habilitar la experiencia conversacional de Pages. ChatGPT Plus no se usó como sustituto.

Hasta resolver esos bloqueos, no se puede declarar una aplicación Cloudflare conversacional conectada al motor cultural ni desplegarla responsablemente.
