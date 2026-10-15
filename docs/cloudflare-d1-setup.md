# Activar la sincronización D1 del laboratorio

**Estado de implementación, no de activación:** el laboratorio conserva una copia local. El código dispone de una ruta para sincronizar únicamente decisiones de revisión a D1 tras autenticar correctamente el acceso, pero esa ruta no debe darse por funcional hasta completar las comprobaciones de esta guía. El manifiesto fuente y los archivos de video/audio deben permanecer en el navegador. La creación de `lab_review_drafts` al primer acceso autenticado es un comportamiento previsto que requiere validación real.

**Incidencia operacional abierta:** [#12](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/12) documenta que, en una comprobación del 14/10/2026, `/api/session` respondió HTTP 503 por configuración incompleta de Cloudflare Access. No es evidencia de que D1 o las variables se hayan verificado en este turno, ni determina por sí sola el estado futuro de producción. Si falla alguno de los controles posteriores, mantener D1 sin declararla sincronizada, conservar el borrador local y registrar el error sin exponer datos.


## 1. Confirmar el binding existente

En Cloudflare → **Workers & Pages** → `plataforma-analisis-cultural-web` → **Settings → Bindings**, debe aparecer:

| Tipo | Variable | Base |
|---|---|---|
| D1 database | `DB` | `analisis-cultural-lab` |

La captura del 12 de octubre de 2026 confirma ese binding.

## 2. Proteger solamente la API

En **Cloudflare One → Access controls → Applications → Add an application → Self-hosted**:

1. Usa el hostname `plataforma-analisis-cultural-web.pages.dev` y el path `/api/*`.
2. Crea una política **Allow** con el correo de la cuenta propietaria; no uses `Everyone`.
3. Guarda la aplicación y copia su **Application Audience (AUD) Tag**.

El path específico deja el sitio público disponible y exige autenticación para las rutas que leen o escriben en D1. Cloudflare documenta el alcance por ruta en [Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) y el JWT de origen en [Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 3. Configurar variables de producción en Pages

En **Settings → Variables and Secrets**, agrega estas variables al entorno **Production**:

| Variable | Valor |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | `https://<tu-equipo>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | El Application Audience Tag de la aplicación Access |
| `CF_ACCESS_ALLOWED_EMAILS` | Correo autorizado, en minúsculas; admite varios separados por coma |

No pongas contraseñas, tokens de GitHub ni claves API en estos campos. Guarda y vuelve a desplegar Pages para aplicar el binding y las variables.

## 4. Comprobar el flujo

1. Abre `/laboratorio/`, importa una exportación del plugin y selecciona localmente el medio.
2. Guarda una decisión humana. Si no tienes sesión de Access, usa **Iniciar sesión segura en Cloudflare**; al regresar, el borrador pendiente se concilia con D1.
3. El estado debe mostrar **Sincronizado en D1**. En D1 SQL, la tabla `lab_review_drafts` debe existir y contener el registro de ese usuario/proyecto/revisión.
4. Recarga, importa la misma revisión y usa **Recuperar borrador**: debe aparecer la decisión guardada. **Borrar copia de D1** elimina solo la fila remota; `localStorage` queda intacto.

## Alcance

Esta D1 pertenece al proyecto Pages y no es la D1 interna del plugin MCP. No hay escritura web→MCP automática: el flujo con el conector sigue usando la exportación JSON separada hasta que se implemente y autorice un puente específico. No importes a D1 datos que no quieras almacenar en tu cuenta Cloudflare.


## 5. Habilitar el archivo académico privado

La ruta `/reversionados/` conserva un archivo editable local en el navegador y ofrece guardar/recuperar en la misma D1 del proyecto. La API es `/api/article-drafts`; requiere el mismo Access de `/api/*`, el binding `DB` y una identidad incluida en `CF_ACCESS_ALLOWED_EMAILS`. Las versiones se guardan como filas inmutables ligadas al correo validado por Access, documento, revisión y hash SHA-256 del Markdown.

1. Verifica primero los pasos 1–3 y la lectura autenticada existente del laboratorio. No uses una sesión anónima como prueba de escritura.
2. En `/reversionados/`, guarda una versión local de prueba con datos sintéticos.
3. Inicia sesión con el botón de Cloudflare Access y pulsa **Guardar historial en Cloudflare**.
4. Comprueba en D1 la tabla `academic_article_versions`; luego pulsa **Recuperar historial de Cloudflare** y coteja la versión y su hash.
5. Si Access devuelve 401/403 o la API 503, conserva el archivo local y corrige la configuración antes de transferir materiales reales.

La sincronización solo ocurre al pulsar el botón explícito. El código no envía fuentes originales ni adjuntos, pero sí envía el contenido de las versiones de manuscrito incluidas en el historial. No sincronices borradores confidenciales o protegidos sin revisar permisos y el tratamiento de datos de tu cuenta Cloudflare.

## 6. Snapshots de cotejos de fuentes y modelos

La sección **Snapshots privados de cotejos · Cloudflare D1** de `/laboratorio/` funciona de forma independiente del archivo académico y del borrador de decisiones. La persona elige cada acción: guardar un snapshot, consultar la lista, recuperar un snapshot en el navegador o eliminar solo el snapshot seleccionado. La importación del proyecto no activa una consulta o escritura automática para estos cotejos.

La solicitud versionada `analysis-cultural/source-model-review-sync/v1` contiene la exportación local `analysis-cultural/source-model-reviews/v1` y un índice efímero con los IDs de fuente/unidad y la pareja `evidence_id`–`unit_id`. El servidor vuelve a comprobar esquema, tipos, límites, revisión, coherencia de los IDs y pertenencia de la evidencia al índice enviado en la misma solicitud, además de restricciones de operación y estado humano. Esta comprobación asegura coherencia interna del payload; no autentica por sí sola el proyecto fuente ni certifica una interpretación. D1 almacena una copia inmutable de los registros de cotejo bajo usuario, proyecto y revisión; el índice efímero se descarta. Un hash hace idempotente el reenvío del mismo snapshot; el límite es de 50 snapshots por proyecto/revisión y el borrado opera sobre un snapshot a la vez.

El snapshot contiene localizadores, notas analíticas, límites, IDs, estado y persona revisora. No contiene el proyecto fuente completo, fuentes bibliográficas, medios, fotogramas, PDFs ni escaneos. Conserva `interpretive_certification=NOT_ASSESSED` y `written_to_private_mcp=false`; la D1 de Pages no conecta ni escribe en el MCP privado. Los snapshots permanecen hasta su eliminación explícita desde la misma sección.

La validación automatizada del contrato no certifica la calidad de las interpretaciones ni la autenticidad de los materiales cotejados. La API requiere los controles de Access del paso 2, las variables del paso 3 y la identidad permitida. El estado de ejecución y el aislamiento multicuenta siguen **pendientes de prueba autenticada en producción** según la incidencia [#12](https://github.com/ceoncoyb/plataforma-analisis-cultural-web/issues/12); no anunciar sincronización operativa antes de comprobar sesión autorizada, snapshot sintético, recuperación, aislamiento y borrado.
