# Contrato de cotejo de fuentes y modelos v1

El archivo [`source-model-reviews-v1.schema.json`](../public/schemas/source-model-reviews-v1.schema.json) define el formato de exportación que produce el panel local de cotejo. El contrato vincula cada registro con una fuente, unidad y evidencia existentes en la exportación del estudio; conserva localizadores, operación, límites, fecha y estado de revisión humana.

La versión v1 se descarga desde el navegador por acción de la persona usuaria. El esquema valida la forma del documento; la comprobación de la aplicación coteja IDs contra el estudio importado y no sustituye la lectura de las fuentes ni la revisión académica. El documento declara `NOT_ASSESSED`, conserva `pending_academic_review` y rechaza campos no definidos, incluidos medios o escaneos añadidos al payload.

Este formato no crea una API, una sesión autenticada, permisos de proyecto ni sincronización con Cloudflare D1 o el MCP privado. Una integración posterior requiere identidad, autorización por proyecto, validación de servidor, auditoría y pruebas de aislamiento conforme al contrato de seguridad del MCP remoto.

Los cambios incompatibles requieren una versión nueva del esquema; una revisión compatible conserva `analysis-cultural/source-model-reviews/v1` y pasa por pruebas de ida, validación de IDs y rechazo de payloads fuera del contrato.
