# Plugin oficial de Mercado Pago — investigación de lectura

Consulta: 5 de noviembre de 2026. No se instaló, creó ni configuró ninguna aplicación
en Mercado Pago. No se solicitaron secretos ni se modificaron credenciales/webhooks.

## Qué existe oficialmente

Mercado Pago documenta un [plugin para Claude Code y Codex](https://www.mercadopago.com.mx/developers/es/docs/mp-plugin/overview),
conectado a su MCP Server. Sus [comandos](https://www.mercadopago.com.mx/developers/es/docs/mp-plugin/commands)
incluyen consulta de documentación, asistencia de integración, diagnóstico de webhooks,
entorno de pruebas y revisión de calidad. Algunos comandos crean usuarios/saldo de
prueba o modifican webhooks; no son consultas inocuas y no se ejecutaron.

La documentación de [Tus integraciones](https://www.mercadopago.com.mx/developers/es/docs/your-integrations/dashboard)
publica comandos de instalación para Codex que referencian
`mercadopago/mercadopago-codex-marketplace`. La consulta de ese repositorio por GitHub
y API devolvió HTTP404 en esta sesión. Esto no demuestra que el producto no exista;
puede requerir acceso o una corrección del enlace. No se instaló desde fuentes alternativas
ni se ejecutó un asistente que pudiera crear una aplicación automáticamente.
La búsqueda en el catálogo de Plugin Management tampoco devolvió coincidencias.

## Qué se pudo comprobar en esta sesión

Las herramientas oficiales `mcp__mercadopago` ya estaban expuestas. Se usaron únicamente:

| Consulta | Resultado real | Alcance |
|---|---|---|
| Búsqueda de documentación, México/español, SmartApps/Main Apps/Orders | Documentación oficial de SmartApps y sus requisitos | No prueba autenticación de una cuenta ni compatibilidad híbrida |
| Formulario de homologación, `action=get_form`, producto45 Smart App, México | `steps=[]`, aviso de que no hay pasos para esos parámetros | No se envió formulario ni se creó solicitud de homologación |

El servidor enumera herramientas para crear aplicaciones, consultar credenciales,
guardar webhooks, crear usuarios/cargar saldo y enviar homologación. **No se invocaron**.
Tampoco se ejecutó evaluación con un pago real. No se cambió la configuración local
del MCP ni se inició una nueva autorización OAuth.

Las [herramientas del MCP](https://www.mercadopago.com.mx/developers/es/docs/mcp-server/tools)
sirven de apoyo al desarrollo. Su disponibilidad no sustituye el contacto con negocios,
la Point de desarrollo, SmartPOS Sandbox ni la aprobación/distribución de Main Apps.
La respuesta vacía del formulario obliga a confirmar con MP el canal correcto para
este producto; no se presume que la homologación de Point/Orders sea la de Main Apps.

## Uso propuesto sin riesgos para la integración actual

Continuar con consultas de documentación y requisitos. Obtener de MP el enlace
vigente al plugin y el canal específico para la homologación privada. Cualquier
alta de aplicación, asignación de credenciales, setup de pruebas o modificación de
webhooks se hará únicamente con autorización y entorno identificados. El plugin
no es necesario para compilar el prototipo ni es una dependencia dentro de la APK.
