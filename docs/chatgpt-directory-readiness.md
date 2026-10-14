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
