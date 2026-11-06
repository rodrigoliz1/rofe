# Publicación propuesta de la estabilización Barista

**Plan pendiente de autorización. Ningún paso de escritura remota se ejecuta en este sprint.** El PR se mantiene Draft, sin auto-merge y sin despliegue automático de su rama.

## A. Preparación y separación de variables sin interrupción

1. Conservar el deployment productivo y commit actuales, nombres/ámbitos de variables, responsables y dependencias. No publicar valores, IDs internos ni archivos `.env`. Confirmar backups de Supabase y disponibilidad de recuperación puntual según el plan contratado.
2. Validar con el propietario la custodia de las credenciales vigentes. Los valores marcados como sensibles pueden no recuperarse por CLI/API; `vercel env pull` no es un respaldo suficiente. Si Vercel exige reintroducir un valor y no se dispone de una copia custodiada, **detener esa edición**; no sustituir ni rotar automáticamente.
3. Preparar un proyecto/backend aislado si se necesitan previews funcionales. Usar otra base y cuentas/usuarios de prueba, JWT, enrollment y hashes propios. No clonar pedidos, usuarios ni información de clientes. Sin Point de prueba autorizada, mantenerla deshabilitada. El backend Vercel preview de esta propuesta está deliberadamente cerrado: habilitar staging requiere otra revisión de arquitectura/allowlist, no un bypass del guard.
4. Sin cambiar el valor productivo, limitar cada registro compartido al ámbito `production`, conservando clave, almacenamiento, opciones y valor cifrado. Comprobar en la interfaz/API vigente que editar únicamente destinos preserva el valor existente. Revisar cada variable y dependencia individualmente antes de guardar. **No ejecutar una eliminación por nombre** que pudiera borrar el registro productivo completo.
5. Releer los metadatos tras cada cambio y comprobar que producción conserva su registro. Añadir registros propios de preview/desarrollo solo cuando el backend aislado esté validado. JWT, bootstrap y enrollment también deben separarse; no basta con los secretos financieros. `PUBLIC_ORDERING_URL` de preview no debe reenviar al checkout productivo.
6. Confirmar que las variables de producción no fueron sustituidas. Los cambios de configuración se aplican a despliegues nuevos; un deployment ya publicado conserva su entorno. **Previews antiguas pueden conservar credenciales inyectadas:** inventariarlas y, con autorización, retirar su acceso/deployments antiguos y revisar permisos. El guard nuevo no modifica retroactivamente esos deployments.
7. Auditoría de ámbitos, sin revelar valores:

   ```sh
   vercel api '/v10/projects/<project>/env?teamId=<team>' --method GET | node scripts/audit-environment-metadata.mjs
   ```

   Código 0 = destinos separados; 1 = registros compartidos detectados; 2 = no se pudo validar. Esto acredita metadatos, no que los valores de dos registros distintos pertenezcan a cuentas diferentes.
8. Verificar conexiones y nombres en el entorno aislado. No habilitar previews ni ejecutar sus builds con secretos productivos. Si falla cualquier paso, conservar el deployment actual y suspender la promoción.

## B. Migraciones y publicación coordinada

1. Aprobar expresamente el contrato de cierre con `sessionId`, la nueva atribución de ingresos y la incorporación de fechas de confirmación. No publicar solo el frontend o solo el backend sin plan de actualización de clientes.
2. Ensayar 009 → 010 → 011 en una base aislada con fixtures y `pg-safeupdate`; ejecutar unitarias, E2E y pruebas PostgreSQL. Comparar históricos antes/después excluyendo únicamente la forma de las columnas nuevas nulas. Probar ambos órdenes de concurrencia entre cobro y cierre.
3. Programar una ventana que evite cierres administrativos mientras conviven versiones de API. No cancelar cobros para crear esa ventana. Informar al personal y verificar que no hay un cierre en vuelo. Las funciones antiguas siguen disponibles para clientes antiguos: no asumir que la migración por sí sola corrige su llamada.
4. Tras autorización, aplicar íntegramente `backend/migrations/010_consistent_cash_close.sql` y después `011_point_reconciliation.sql`, cada una transaccional. Son aditivas: no borran movimientos, no recalculan saldos ni modifican históricos al aplicarse.
5. Verificar esquema 11, ACL/RLS, columnas y funciones nuevas mediante consultas de lectura. Comparar huellas de las columnas financieras preexistentes. Si alguna diferencia inesperada aparece, detener la publicación e investigar; no compensar saldos.
6. Publicar un commit revisado de esta rama con la conciliación aún apagada. Validar `/health`, `/ready`, autenticación, catálogo, panel de pagos y lectura de caja. Forzar la renovación de las instancias serverless: la versión de esquema se cachea durante la inicialización.
7. Recargar Administración/PWA y verificar que todos los clientes de cierre envían `sessionId`. Las APK existentes consumen el mismo sitio HTTPS y conservan paquetes, firmas, registros y sesiones. Un cliente antiguo debe fallar sin producir un corte.
8. Habilitar cierres del personal solo después de comprobar las versiones. No automatizar un corte real de prueba. El primer cierre operativo será supervisado y autorizado.

## C. Programación autónoma y operación

1. Crear `CRON_SECRET` independiente, persistente y de al menos 32 caracteres, custodiado fuera de Git y configurado exclusivamente en producción y en el programador autorizado. No reutilizar tokens de Mercado Pago, JWT ni la clave de enrollment.
2. Verificar la frecuencia disponible en el plan de Vercel. La documentación consultada limita Hobby a una ejecución diaria, insuficiente para esta conciliación. Usar un plan compatible con el intervalo de un minuto o un programador seguro externo; no depender de la Mac, de un navegador ni de una tablet. No activar un servicio nuevo sin autorización.
3. `ops/vercel.point-cron.example.json` contiene la propuesta de agenda; **no está incorporada al `vercel.json` activo**. Integrarla requiere revisión/publicación separada. Vercel envía GET al dominio productivo con el bearer configurado; un programador externo debe enviar el mismo header por HTTPS, sin poner el secreto en URL ni logs.
4. Configurar `POINT_RECONCILIATION_ENABLED=true` solo después de verificar migración, secreto y programador. Probar primero en un entorno autorizado aislado con un proveedor simulado o terminal oficial de prueba.
5. Comprobar en logs de agenda respuestas 200, conteos de reclamados/resueltos y fallos. No considerar el flag habilitado como prueba de que existe una agenda activa. La UI lo advierte expresamente.
6. Establecer alertas operativas si no hay ejecuciones correctas en dos intervalos, o si aparecen errores de importe/referencia/registro local. Cada iteración procesa cinco registros; revisar capacidad y demora con el volumen real antes de ampliarla.
7. En una revisión inicial, listar pagos anteriores que no tienen fecha de confirmación, y pendientes sin referencia. No cambiar estados, liberar inventario ni reasignar turnos sin comprobación del proveedor y autorización pertinente.

## D. Validación posterior

Pruebas de humo productivas de lectura: disponibilidad, login del personal realizado por el propietario, metadatos de esquema, catálogo, pendientes y sesión actual. No usar rutas de pedido individual que reconcilien como si fueran estrictamente de lectura. Invocar el worker puede confirmar pagos y descontar inventario: **no es un smoke test no destructivo** y su activación requiere autorización operativa.

Prueba física pendiente, con importe y operación autorizados: Kiosco crea una orden, Point muestra el importe, confirmación real, recepción/sonido único en Barista; repetir un caso con el Kiosco cerrado para comprobar conciliación, reconexión y consistencia de inventario. No realizar cargos, anulaciones, reembolsos ni cortes de ensayo sobre datos reales sin esa autorización específica.

## E. Reversión

- Deshabilitar el programador y el flag sin cambiar credenciales financieras. Las concesiones pendientes vencen; la conciliación por webhook/consulta existente continúa. No borrar la cola ni reenviar órdenes.
- Revertir frontend y backend juntos a un deployment verificado si hace falta; conservar las columnas/tablas aditivas y todos los registros producidos. No aplicar `DROP`, restauraciones destructivas ni migraciones inversas sobre históricos.
- Volver al backend anterior restablece su riesgo de cierre previo al bloqueo: mantener los cierres administrativos suspendidos hasta corregirlo. No anunciar esa reversión como una versión segura de caja.
- No volver a compartir secretos productivos con preview como método de rollback. Si una edición de ámbito falló, reparar exclusivamente el registro de producción con el valor custodiado y preservar su deployment anterior hasta verificarlo.
- Revisar órdenes con resultado incierto mediante GET; no generar un segundo cobro ni ajustar caja manualmente para compensar diferencias.
