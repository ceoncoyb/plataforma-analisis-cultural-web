# Preparación para el directorio de ChatGPT

## Estado comprobado

- La integración MCP existente opera en el Site `analisis-cultural-mcp` con su URL, identidad, permiso custom y D1 vigentes.
- Su acceso actual es privado a la cuenta propietaria. Este repositorio no cambia ni incorpora esa integración.
- La web pública no promete instalación de ChatGPT; muestra el estado de piloto privado.
- El sitio cuenta con sandbox local, página de privacidad y repositorio público. Eso no constituye aprobación ni distribución del plugin.

## Arquitectura previa a una distribución para terceros

1. Mantener la integración actual y sus registros en producción sin cambios.
2. Diseñar un servicio público separado con OAuth real por persona o espacio y controles de tenant probados. No apuntarlo a la D1 privada ni migrar/importar proyectos actuales.
3. Someter la arquitectura de identidad, retención, exportación y borrado a pruebas de aislamiento entre dos cuentas antes de guardar datos de clientes.
4. Actualizar esta política con el flujo de datos real del servicio externo, subprocesadores y derechos del usuario.
5. Con un servidor MCP remoto estable en HTTPS y un dominio controlado, usar la ruta **With MCP** del portal de Plugins de OpenAI. Un ZIP de skills no sustituye el envío remoto del MCP. Preparar las pruebas, metadatos, escaneo y vídeo requeridos por ese flujo.

Si el lanzamiento exige cambiar la identidad, permisos, endpoint o D1 del Site actual, se detiene y rediseña la ruta. No publiques un paquete que conecte al MCP privado o que pida una clave compartida.


## Contrato de seguridad para el MCP remoto

El MCP remoto constituye un servicio público separado de la web Pages, del almacenamiento D1 de revisión y del conector privado de ChatGPT. La ruta propuesta es:

```text
ChatGPT ── OAuth del usuario ──> MCP remoto (/mcp)
                                      │
                                      ├── catálogo público del producto (solo lectura)
                                      └── espacio del usuario, únicamente tras autorización por proyecto

Web Pages ── Cloudflare Access ──> API y D1 del laboratorio
Conector privado ─────────────────> proyecto científico privado
```

Estas rutas mantienen propietarios, credenciales, permisos y almacenes separados; compartir una interfaz o un vocabulario de análisis no habilita una conexión entre ellas.

### Identidad, alcance y autorización

- El servidor valida cada token según el emisor, la firma, la audiencia, la vigencia y los permisos declarados para el cliente y la herramienta solicitada. El proveedor, el registro de cliente y el dominio se eligen antes de publicar; este documento no declara que estén configurados.
- La identidad de usuario y el espacio autorizado se derivan de la sesión validada y de una relación de membresía comprobada por el servidor. El identificador de proyecto recibido en una llamada es un selector, no una prueba de acceso; cada lectura vuelve a verificar usuario, proyecto y revisión.
- La primera superficie expuesta se limita a metadatos públicos del producto en modo de solo lectura. La lectura de espacios privados requiere autorización expresa por proyecto y una prueba de aislamiento entre cuentas. Las herramientas de escritura requieren permiso específico, consentimiento visible, registro de auditoría y una vía comprobada de revocación y borrado.
- Las anotaciones de proyecto, borradores de tesis, decisiones autorales, archivos, corpus, imágenes y bibliotecas permanecen fuera del servicio público inicial. No se importan desde el conector privado ni se exponen mediante IDs, logs, mensajes de error o exportaciones.
- El registro operativo conserva el identificador de solicitud, la identidad seudonimizada, el ámbito autorizado, la herramienta, el resultado y el momento; excluye tokens, texto del corpus, archivos y payloads completos. La retención y eliminación se fijan antes de habilitar persistencia.

### Puertas previas a cualquier publicación

1. Confirmar dominio y entorno de alojamiento controlados por el propietario, proveedor OAuth, registro de cliente y destinatarios permitidos; almacenar credenciales solo como secretos del servicio.
2. Acordar un esquema versionado limitado a metadatos y un catálogo de herramientas con permisos mínimos; documentar qué campos entran, se guardan, se exportan y se eliminan.
3. Revisar amenazas de suplantación, reproducción de tokens, confusión de audiencia, acceso horizontal entre proyectos, elevación de permisos, abuso de herramientas y filtración por logs.
4. Aprobar política de acceso, revocación, auditoría, límites de uso, retención y borrado. Mantener la D1 del laboratorio y el MCP privado fuera del alcance del servicio remoto.
5. Probar con dos identidades y proyectos sintéticos: cinco recorridos autorizados y tres rechazos (otra cuenta, proyecto/revisión fuera de alcance y operación sin permiso); incluir expiración/revocación y confirmar que no se devuelve contenido cruzado.
6. Verificar la instalación con una cuenta elegible de ChatGPT y distinguir conexión, revisión del directorio y publicación. Una respuesta HTTP correcta o el éxito del escáner no acredita aislamiento ni aprobación.

### Decisiones del propietario pendientes

El desarrollo del endpoint queda condicionado a confirmar el dominio y el entorno de despliegue, el proveedor OAuth, el modelo de membresía/tenancy, la retención autorizada y los datos legalmente confirmados de soporte y privacidad. También se necesita resolver el estado de producción de Access/D1 de Pages por el issue #12. Mientras esas decisiones y pruebas falten, el contrato es una especificación de seguridad; no describe un puente operativo ni habilita sincronización.

## Lista de entrega para el portal de Plugins

- [ ] Identidad de desarrollador individual o negocio verificada.
- [ ] Seleccionar **With MCP** para un servidor MCP remoto accesible por HTTPS. Los ZIP de skills y los MCP locales aprobados siguen rutas distintas; no se debe enviar el servidor remoto como ZIP de skills.
- [ ] Elegir y verificar la URL estable del MCP remoto **antes de enviar la integración**: un cambio posterior del endpoint publicado puede exigir un proceso adicional de actualización o soporte.
- [ ] Dominio del servidor verificado con el challenge que entrega el portal.
- [ ] URL `/mcp` estable; autenticación compatible declarada en `mcp.json` (OAuth/DCR/CIMD según la implementación). No incluir secretos ni incrustar bearer tokens.
- [ ] Herramientas mínimas y con nombres/descripciones congruentes con sus efectos; incluir las anotaciones `readOnlyHint`, `openWorldHint` y `destructiveHint` y sus justificaciones según la revisión MCP; minimizar permisos, datos y retención.
- [ ] Escaneo MCP y comprobaciones de metadatos pasan.
- [ ] HTTPS disponible para **sitio web, soporte, privacidad y términos de uso**; política de datos específica para la aplicación pública, controles de consentimiento y retención claramente descritos.
- [ ] Cinco pruebas positivas y tres negativas, verificadas con una cuenta de demostración y datos ficticios:
  - Positivas: crear perfiles independientes; registrar una fuente y sus localizadores; proponer lecturas con evidencia a favor y en contra; auditar el 100 % de las unidades declaradas para el corpus de prueba, con recuento derivado de su estructura real; recorrer todas las secuencias, intervalos, fotogramas y demás unidades audiovisuales declaradas que correspondan al caso, sin imponer un número fijo de segmentos.
  - Negativas: intentar abrir el proyecto de otra cuenta; pedir que se inventen localizadores/tiempos ausentes; pedir una certificación interpretativa o un cuadrado sin satisfacer sus condiciones de evidencia.
- [ ] Vídeo accesible que demuestra los casos, notas de versión y países disponibles. Metadatos del listado dentro de los límites actuales: nombre visible hasta 30 caracteres, descripción breve hasta 30, máximo 20 capacidades y hasta tres prompts de inicio; sin publicidad de precios o promociones.
- [ ] Revisión de OpenAI aprobada; publicación desde el portal.
- [ ] Prueba de conexión desde la ficha pública y monitoreo de escaneos posteriores.

OpenAI documenta la ruta **With MCP** y el proceso de revisión en el [portal de envío](https://developers.openai.com/plugins/deploy/submission), los [errores y requisitos de validación](https://developers.openai.com/plugins/deploy/submission-errors) y las [reglas del directorio](https://developers.openai.com/plugins/plugin-guidelines). La aprobación no está garantizada. Un piloto incompleto, una demo o un servidor privado no equivale a un plugin publicable; nunca se incluyen secretos en el paquete ni en la ficha.

## Monetización

La guía vigente del Directorio permite comercio en plugins para bienes físicos. No permite que un plugin venda o promueva directamente o indirectamente suscripciones, productos o servicios digitales. Un usuario puede iniciar sesión en una cuenta de pago ya existente; el plugin también puede explicar una limitación de acceso o enlazar una página informativa de planes, sin iniciar una compra. Por eso, cualquier SaaS de pago se deberá validar y comercializar en la web como un canal separado; la experiencia del plugin no ofrecerá checkout ni funcionará como funnel de upsell. Los detalles oficiales de monetización del Apps SDK siguen pendientes y no hay reparto de ingresos o pago en ChatGPT configurado aquí.
