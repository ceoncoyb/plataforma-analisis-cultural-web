# Instancia hermenéutica postsemiótica L10

L10 opera como instancia interpretativa humana posterior a la síntesis semiótica interna L8 y, cuando corresponde, al contraste L9. No añade descripción al registro L1; tampoco es una capa automática por intervalo ni condición para aprobar la cobertura estructural. Las extensiones postgreimasianas —cuerpo, presencia, intensidad/extensidad, tempo y enunciación— permanecen como operaciones analíticas separadas, con evidencia propia; pueden alimentar L8 y orientar preguntas para L10, sin convertirse por sí solas en interpretaciones culturales.

## Corpus y estado de consulta

El objeto primario es el material audiovisual, sonoro y lírico del estudio, con localizadores y evidencia canónicos. El marco teórico se importa desde `method_profile.postsemiotic_hermeneutic_contract.object_corpus.theory_corpus`; el selector limita cada propuesta a fuentes también presentes en el proyecto. Cada entrada declara su función, extensión consultada y localizadores verificados. En el proyecto ONCOY, Quezada aporta el marco semiótico de mito/semiosis; Fontanille y Zilberberg sostienen extensiones corporales y tensivas solo en la medida que se verifiquen textos y páginas; Martínez Villarroya opera como propuesta comparativa/transductiva autoral, y Violi, Lotman, Eco y Chion conservan funciones opcionales y específicas, sin formar una doctrina única.

Los estados `abstract_only`, `metadata_only` y `pending` bloquean la declaración de cotejo íntegro o de páginas específicas. Los metadatos bibliográficos identifican obras; los resúmenes orientan búsquedas; las afirmaciones teóricas que dependan de una definición o modelo requieren acceso directo a texto, edición y página/sección. El estado de fuente configurado se conserva en cada versión del proyecto y se eleva solo después del cotejo documental registrado.

## Secuencia de revisión

1. Vincular síntesis interna L8, unidades y evidencias existentes.
2. Seleccionar fuente del corpus permitido y consignar edición/localizador y extensión consultada.
3. Declarar la operación de mapeo —analogía, homología, transducción, abducción cultural o correlación tensiva— y exponer sus pasos.
4. Formular una hipótesis acotada, una lectura alternativa, contraevidencia y límite de alcance.
5. Asignar `SUPPORTED`, `PLAUSIBLE/INFERENCE` o `SPECULATIVE/OPEN` según la convergencia y el estado documental.
6. Registrar la decisión autoral por separado. Una aceptación requiere persona y fecha; la herramienta nunca sustituye esa decisión.

`SUPPORTED` requiere evidencia localizada en al menos dos unidades y cotejo directo de texto o páginas; describe apoyo interpretativo, no prueba objetiva. `PLAUSIBLE/INFERENCE` mantiene visibles la ambigüedad y los vacíos. `SPECULATIVE/OPEN` no se exporta como hecho de Resultados. En todas las categorías se mantiene una lectura alternativa y se declara el alcance.

## Historial y exportación

Las lecturas L10 heredadas aparecen en modo de consulta y permanecen pendientes hasta una revalidación individual; importar el proyecto no las cambia. Las propuestas nuevas se guardan y exportan localmente, separadas de la fuente; el esquema fija `interpretive_certification: NOT_ASSESSED` y prohíbe sincronización con D1/MCP en esta exportación.

El esquema v1 está en [`hermeneutic-reviews-v1.schema.json`](../public/schemas/hermeneutic-reviews-v1.schema.json). El validador de aplicación comprueba, además de la forma, los IDs de fuente, unidades, evidencias y síntesis L8 contra la exportación importada.
