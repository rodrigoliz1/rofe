# Error de apertura de caja en producción — 5 de noviembre de 2026

## Evidencia comprobada

Vercel registró el soporte `d25e4980-a770-4768-88cc-79465d24d8d9` a las
20:55:24.141 UTC (14:55:24 de Ciudad de México):

```json
{"event":"request_failed","requestId":"d25e4980-a770-4768-88cc-79465d24d8d9","method":"POST","path":"/api/admin/cash/session/open","code":"INTERNAL_ERROR","message":"UPDATE requires a WHERE clause","databaseCode":"21000","operation":"cash_session"}
```

La solicitud falló en **apertura**, dentro de `open_cash_session(jsonb)`, no en un
corte anterior. Las funciones de apertura y cierre definidas en 001 y aún vigentes
en el esquema 008 contienen `update cash_register set count = 0;` sin predicado.
La protección pg-safeupdate de PostgREST lo rechaza con SQLSTATE 21000. No era un
fallo de credenciales, denominaciones ni validación del formulario. El frontend
mostraba fielmente el mensaje público genérico del backend y su código de soporte.

Se reprodujo el mismo error en PostgreSQL 16 con pg-safeupdate real, commit
`37dbc9c4acf5e2504adf2b218e9c6b41751022f3`, y se comprobó reversión completa de
la inserción de sesión y del efectivo. La prueba JSON previa no incluía este guard.

Consulta de solo lectura al investigar: 0 sesiones, 0 movimientos de sesión,
13 denominaciones, 26 transacciones, 4 cortes legacy y 0 cortes consolidados.
No hay sesiones duplicadas ni una apertura parcial. Estos conteos **no equivalen**
a certificar la conciliación contable física de los registros legacy; se conservan
íntegros y no se convierten en sesiones automáticamente.

## Corrección

`backend/migrations/009_cash_session_safe_updates.sql` reemplaza ambas funciones
con `update cash_register set count = 0 where count <> 0;`. Se conservan los
bloqueos, índices únicos, firma de RPC, permisos y la transacción que guarda sesión,
denominaciones y ambos informes. No se cambia la migración histórica 001.

Aplicar 009 ejecuta únicamente DDL de funciones/permisos y marca esquema 9.
**No ejecuta apertura, cierre, UPDATE/DELETE de datos ni ajustes de saldo.**
Los UPDATE del archivo pertenecen al cuerpo de funciones; solo se ejecutan cuando
un operador realiza posteriormente su operación normal de caja.

El backend conserva SQLSTATE y nombre de RPC en registros, redacta secretos y
traduce este fallo específico a HTTP 503 con mensaje útil para Administración.
No reintenta operaciones financieras automáticamente ni divide el RPC en llamadas REST.

## Pruebas y aplicación

- Regresión PostgreSQL con pg-safeupdate: apertura, movimiento, cierre, turno
  siguiente y reintentos; fallo del informe revierte sesión/efectivo/corte legacy.
- Carreras PostgreSQL: 8 aperturas y 8 cierres simultáneos; un ganador por operación.
- Pruebas API de errores y frontend de conservación del mensaje/código de soporte.
- El CI compila el guard fijado por commit y lo activa en todas las conexiones de prueba.

Prueba local con módulo compilado:

```sh
SAFEUPDATE_LIBRARY=/ruta/absoluta/safeupdate.so npm --prefix backend run test:db
```

En macOS el módulo puede terminar en `.dylib`. El script crea su propio clúster
sin TCP y nunca lee DATABASE_URL ni usa la base real.

Para producción es indispensable aplicar 009 mediante un acceso SQL autorizado.
La credencial de servicio REST disponible no permite reemplazar funciones SQL.
En Supabase SQL Editor del proyecto ROFÉ: revisar y ejecutar el archivo 009 íntegro;
después ejecutar `backend/scripts/verify-cash-session-schema.sql` (solo lectura).
El resultado debe indicar versión 9 y `filtered_drawer_reset=true` para ambas RPC.
No desactivar safeupdate, no borrar sesiones y no modificar denominaciones a mano.

La validación financiera física queda a cargo de una operación normal autorizada
del responsable: apertura con conteo real, operación aprobada y cierre con conteo
real. Las comprobaciones automatizadas de producción serán exclusivamente de lectura
(o cotización sin persistencia); no crearán cortes ni cobros de prueba.

## Estado comprobado tras aplicación

El dueño confirmó aplicación de 009. A las **21:18:35 UTC del 5-nov-2026** el RPC
remoto de solo lectura devolvió **9**. Se compararon filas completas (ordenadas) de
las seis tablas financieras anteriores: **todas idénticas** a la instantánea previa.
No hubo ajustes de efectivo ni cambios históricos. Evidencia privada, sin secretos
publicados: `.rofe-local/evidence/cash-close-production/readonly-verification.json`.

Validación local del parche: lint, typecheck de ambos proyectos, 33 pruebas frontend,
69 backend, 78 E2E, compilaciones frontend/backend y PostgreSQL con pg-safeupdate
real y concurrencia. Dependencias de producción: cero vulnerabilidades en ambos
proyectos. La operación financiera física de producción no se ejecutó como prueba.


## Observación de operación posterior (solo lectura)

En la revisión de las 19:18 CDMX se encontró una apertura registrada por la
operación del local a las **15:35:04 CDMX del 5-nov-2026**, después de 009. Hay
una sola sesión abierta, 18 movimientos vinculados a ella y ninguna operación
UUID duplicada. El saldo calculado por el libro coincide con las denominaciones;
no hay denominaciones negativas y las 26 transacciones y cuatro cortes legacy
originales permanecen idénticos. El cierre de esa sesión aún no se había realizado.

Estas operaciones **no fueron pruebas automatizadas del agente**. Se observaron
sin cambios mediante la API de lectura. Evidencia privada:
`.rofe-local/evidence/cash-close-production/live-session-readonly-audit.json`.
