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
5. Con un endpoint estable, dominio controlado, manifiesto y paquete completos, preparar las pruebas y video exigidos en el portal de Plugins de OpenAI.

Si el lanzamiento exige cambiar la identidad, permisos, endpoint o D1 del Site actual, se detiene y rediseña la ruta. No publiques un paquete que conecte al MCP privado o que pida una clave compartida.

## Lista de entrega para el portal de Plugins

- [ ] Identidad de desarrollador individual o negocio verificada.
- [ ] ZIP del plugin con metadatos; una sola conexión MCP.
- [ ] Elegir la URL final antes de enviar el ZIP: el flujo de actualización no permite cambiar el MCP URL en una versión publicada sin contactar a soporte.
- [ ] Dominio del servidor verificado con el challenge que entrega el portal.
- [ ] URL `/mcp` estable; autenticación compatible declarada en `mcp.json` (OAuth/DCR/CIMD según la implementación). No incluir secretos ni incrustar bearer tokens.
- [ ] Herramientas mínimas, nombres y descripciones coinciden con sus efectos y minimizan datos.
- [ ] Escaneo MCP y comprobaciones de metadatos pasan.
- [ ] Política de privacidad específica para la aplicación pública y controles de consentimiento claros.
- [ ] Cinco pruebas positivas y tres negativas, verificadas con una cuenta de demostración y datos ficticios:
  - Positivas: crear perfiles independientes; registrar una fuente y sus localizadores; proponer lecturas con evidencia a favor y en contra; auditar el 100 % de las unidades declaradas para el corpus de prueba, con recuento derivado de su estructura real; recorrer todas las secuencias, intervalos, fotogramas y demás unidades audiovisuales declaradas que correspondan al caso, sin imponer un número fijo de segmentos.
  - Negativas: intentar abrir el proyecto de otra cuenta; pedir que se inventen localizadores/tiempos ausentes; pedir una certificación interpretativa o un cuadrado sin satisfacer sus condiciones de evidencia.
- [ ] Video accesible que demuestra los casos, notas de versión y países disponibles.
- [ ] Revisión de OpenAI aprobada; publicación desde el portal.
- [ ] Prueba de conexión desde la ficha pública y monitoreo de escaneos posteriores.

OpenAI documenta el envío y revisión de plugins en el [portal oficial](https://developers.openai.com/plugins/deploy/submission). La aprobación no está garantizada. La guía oficial explica que los secretos permanecen fuera del ZIP y que los MCP requieren verificación de dominio y escaneo.

## Monetización

La guía vigente del Directorio permite comercio en plugins para bienes físicos. No permite que un plugin venda o promueva directamente o indirectamente suscripciones, productos o servicios digitales. Un usuario puede iniciar sesión en una cuenta de pago ya existente; el plugin también puede explicar una limitación de acceso o enlazar una página informativa de planes, sin iniciar una compra. Por eso, cualquier SaaS de pago se deberá validar y comercializar en la web como un canal separado; la experiencia del plugin no ofrecerá checkout ni funcionará como funnel de upsell. Los detalles oficiales de monetización del Apps SDK siguen pendientes y no hay reparto de ingresos o pago en ChatGPT configurado aquí.
