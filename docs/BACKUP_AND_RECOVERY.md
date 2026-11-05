# Backup y recuperación

## Política mínima

- Activa Point-in-Time Recovery de Supabase cuando el plan lo permita.
- Conserva un backup lógico diario cifrado fuera del proyecto y al menos una copia semanal fuera del proveedor.
- Retención sugerida: 14 diarios, 8 semanales y 12 mensuales.
- Nunca guardes dumps, claves o datos de clientes en Git.

## Prueba de restauración

Una copia no cuenta como backup hasta restaurarla. Cada trimestre:

1. Crea un proyecto PostgreSQL aislado.
2. Restaura el último backup.
3. Ejecuta las migraciones pendientes.
4. Compara conteos y totales de `orders`, `cash_movements`, `inventory_movements` y `daily_closings`.
5. Ejecuta tests de lectura y un cierre de prueba.
6. Registra tiempo de recuperación y cualquier inconsistencia.

## Incidente

Detén escrituras, conserva logs y marca el momento del incidente. Restaura al punto anterior en una base nueva; valida antes de cambiar conexiones. No sobrescribas la base dañada hasta confirmar que la restauración es completa.
