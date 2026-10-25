# Contrato de cotejo de fuentes y modelos v1

El archivo [`source-model-reviews-v1.schema.json`](../public/schemas/source-model-reviews-v1.schema.json) define el formato de exportación que produce el panel local de cotejo. El contrato vincula cada registro con una fuente, unidad y evidencia existentes en la exportación del estudio; conserva localizadores, operación, límites, fecha y estado de revisión humana.

La exportación v1 se descarga desde el navegador por acción de la persona usuaria. El esquema valida la forma del documento; la comprobación de la aplicación coteja IDs contra el estudio importado y no sustituye la lectura de las fuentes ni la revisión académica. Si el estudio declara `source_figure_provenance_gate`, el selector y los validadores local y remoto limitan los cotejos a los IDs teóricos requeridos por el módulo declarado y rechazan una declaración incompleta. El documento conserva `NOT_ASSESSED` y `pending_academic_review`, y rechaza campos no definidos, incluidos medios o escaneos.

El formato de exportación no autentica fuentes ni certifica interpretaciones. La API opcional de snapshots en Pages está descrita en [`cloudflare-d1-setup.md`](cloudflare-d1-setup.md); no enlaza esta D1 con el MCP privado. La autenticación y el aislamiento reales aún requieren E2E en producción.

Los cambios incompatibles requieren una versión nueva del esquema; una revisión compatible conserva `analysis-cultural/source-model-reviews/v1` y pasa por pruebas de ida, validación de IDs y rechazo de payloads fuera del contrato.
