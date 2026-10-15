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
