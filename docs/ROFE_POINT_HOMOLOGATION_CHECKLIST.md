# ROFÉ Point — checklist de homologación y punto de reanudación

Estado al 5 de noviembre de 2026: **prototipo local revisable; integración financiera
sin decidir; homologación no iniciada**. Rama `codex/rofe-point-main-app`, base
`main` en `6cfb68f`, implementación inicial en `400e9f8`.
El PR se conserva en **Draft**, sin merge, distribución comercial ni instalación
en una Point de producción. Las casillas pendientes no autorizan ejecutarlas.

## 1. Requisitos ya cumplidos — alcance del prototipo

- [x] Módulo Android nativo Kotlin `:point`, independiente de Kiosco y Barista.
- [x] Identidades de paquete separadas; variante `prototype` sin HOME y `mainapp`
  con declaración HOME aislada. No se cambió la aplicación predeterminada.
- [x] Pantalla corporativa de espera, desconexión, diagnóstico y error recuperable.
- [x] Recuperación al volver a la Activity, recreación y observación de red;
  descarte de respuestas tardías/duplicadas y timeout de inspección.
- [x] Puerto `MainAppHost` desacoplado; no tiene operaciones financieras.
- [x] Adaptador de inspección con SDK público oficial 7.3.1, hash verificado y
  dependencia Gson explícita. Sin Client ID autorizado no inicializa el SDK.
- [x] No hay captura de tarjetas, historial, ajustes, PIN predeterminado ni
  administración propia. No hay access tokens de producción en la APK.
- [x] Backup/transferencia y tráfico sin cifrar deshabilitados; permisos mínimos,
  logs propios con vocabulario fijo y sin payloads/identificadores financieros.
- [x] 42 pruebas de Point aprobadas en JVM/Robolectric, incluidos API31/API34;
  39 pruebas existentes de Kiosco/Barista aprobadas. No son pruebas físicas de N950.
- [x] Lint sin incidencias en las variantes verificadas y APK debug instalable
  compilada; firmas debug y hashes comprobados. **No es una firma comercial**.
- [x] Pipeline CI definido, scripts de SDK y de emulador preparados. El script de
  emulador rechaza dispositivos físicos. Definir CI no equivale a que sus jobs hayan pasado.
- [x] Arquitectura, matriz, limitaciones, pruebas y estudio del plugin documentados.
- [x] Flujo financiero de producción conservado: sin cambios en Orders API,
  SELF_SERVICE, terminal, webhooks, credenciales ni aplicaciones actuales.

Evidencia: [arquitectura](ROFE_POINT.md), [validación local](ROFE_POINT_VALIDATION.md)
y [matriz de compatibilidad](ROFE_POINT_HOMOLOGATION.md).

## 2. Trabajo técnico posible sin terminal de desarrollo

Puede prepararse localmente o en CI, sin cambiar la integración financiera. Requiere
priorización posterior; publicar este Draft no incluye habilitar firmas o despliegues.

- [ ] Ejecutar y archivar CI del commit publicado; separar resultados nuevos de
  los reportes locales ya existentes. Registrar URL de run, SHA y artefactos.
- [ ] Ejecutar pruebas instrumentadas en emulador API31+ y archivar inicio en frío,
  suspensión/reanudación, recreación y recuperación de conectividad. El emulador
  no certifica compatibilidad con el host de Mercado Pago.
- [ ] Ampliar revisión de accesibilidad, texto grande y orientación en Android;
  revisar amenazas y dependencias, incluido el SDK, sin presentar una autoevaluación
  como auditoría de seguridad de Mercado Pago.
- [ ] Preparar plantilla de evidencias con versión, precondiciones, resultado
  esperado/observado, responsable y referencia a logs sanitizados.
- [ ] Definir custodia del keystore exclusivo de Point y respaldo cifrado; acordar
  con MP los requisitos antes de la firma final. No sobrescribir claves anteriores.
- [ ] Preparar, cuando se autorice, protecciones/revisores del environment
  `rofe-point-homologation`. No almacenar secretos en Git ni firmar por defecto.
- [ ] Actualizar inventario de componentes/licencias y reglas de conservación de
  logs para el paquete final; confirmar versión de SDK y reglas de minificación.
- [ ] Preparar una release firmada **para revisión** solo después de resolver los
  requisitos, obtener configuración autorizada y recibir instrucción expresa.
  **No generar ahora una release comercial ni enviarla a terminales.**

## 3. Requisitos que dependen de Mercado Pago

- [ ] Contacto formal con negocios y asignación de responsable SmartApps en México.
  La factibilidad comunicada por soporte no sustituye este requisito.
- [ ] Confirmación escrita para N950/Point Smart 2, país, firmware y modalidad
  desatendida: alcance real de Main App y restricciones de seguridad del host.
- [ ] Decisión financiera oficial: validar Orders API externos + SELF_SERVICE +
  Main App, o definir otro diseño mediante SDK. **No se asume coexistencia**.
- [ ] Contrato de recepción/retorno: quién presenta el pago, qué eventos son
  oficiales, cómo se autentican y qué ocurre al aprobar, cancelar o expirar.
- [ ] Aprobación para una eventual alta privada/Client ID; no crear una aplicación
  ni cambiar la vinculación o credenciales del comercio sin autorización.
- [ ] N950 de desarrollo habilitado y SmartPOS Sandbox actualizado/configurado por MP.
- [ ] SDK y documentación vigentes, requisitos de firma, condiciones de uso y
  análisis de seguridad exigidos para esta versión y tipo de aplicación.
- [ ] Procedimiento oficial para HOME, rol de SmartPOS/Mediator y restricciones
  durante las pantallas nativas. Fullscreen propio no asegura bloqueo integral.
- [ ] Recuperación administrativa autenticada y rollback sin reset, desvinculación
  ni pérdida de configuración. No improvisar accesos ocultos ni bloquear el host.
- [ ] Canal de recepción de APK/evidencias, criterios de aceptación, aprobación y
  distribución manual por MP. El formulario MCP consultado devolvió pasos vacíos;
  no existe una solicitud de homologación enviada desde este proyecto.

## 4. Pruebas pendientes con N950 y SmartPOS Sandbox

Solo después de que MP habilite el entorno y defina el contrato financiero. Usar
cuentas, terminal y medios de prueba identificados; **sin cobros reales**.

- [ ] Instalación autorizada del candidato, firma/identidad y actualización sin
  pérdida de configuración; validar selección y recuperación del launcher.
- [ ] Arranque en frío/reinicio, suspensión, rotación, muerte del proceso y horas
  continuas de reposo con pantalla encendida; confirmar regreso a espera.
- [ ] Envío desde un Kiosco de pruebas al backend de pruebas y terminal sandbox,
  según el mecanismo aprobado. Confirmar importe y un único iniciador financiero.
- [ ] Aprobación, rechazo, cancelación válida, expiración y abandono; registrar el
  retorno real a ROFÉ Point sin deducir el resultado a partir de `onResume`.
- [ ] Reintentos, eventos duplicados, múltiples órdenes y reinicio durante un pago;
  confirmar ausencia de doble cobro, correspondencia con pedido y conciliación.
- [ ] Pérdida/retorno de Wi-Fi, internet, host y backend; no repetir un cobro ante
  incertidumbre. Verificar recuperación de estado por el mecanismo aprobado.
- [ ] Webhooks de sandbox, idempotencia y recuperación central, sin modificar los
  endpoints, credenciales o datos de producción existentes.
- [ ] Atrás/Home/Recientes, gestos, notificaciones, panel rápido, accesos físicos y
  pulsaciones largas en **cada pantalla nativa y propia**. Documentar cualquier salida.
- [ ] SDK y aplicación sin PAN/CVV, tokens, datos personales ni payloads sensibles
  en logs, almacenamiento o capturas; verificar permisos del APK final.
- [ ] Administración y reversión por el procedimiento oficial, con autenticación
  y permisos verificados; conservar registro de resultado y responsable.

## 5. Documentación y evidencias para presentar

- [x] Descripción funcional y arquitectura con límite entre interfaz y procesamiento.
- [x] Matriz N950 y limitaciones explícitas, incluida decisión financiera pendiente.
- [x] Reporte local de pruebas, hashes de APK debug y procedencia/hash del SDK.
- [x] Renderizados nativos locales disponibles; etiquetados como Robolectric,
  sin presentarlos como capturas físicas ni evidencia de un pago.
- [ ] Respuesta/contrato oficial de MP, responsable asignado y aceptación del diseño.
- [ ] Identificación de cuenta/terminal de desarrollo por canal privado; no copiar
  identificadores del comercio, credenciales o registros privados al PR.
- [ ] APK final de revisión (<50MB), versión incremental, SHA-256, huella pública
  del certificado persistente y resultado de `apksigner`. **Nunca enviar la clave privada**.
- [ ] Inventario de permisos/componentes/dependencias, licencias y evaluación de
  seguridad del paquete final, con hallazgos y resolución.
- [ ] Reportes de CI y pruebas instrumentadas vinculados al mismo commit/APK.
- [ ] Matriz completa de resultados sandbox, capturas/video físicos sanitizados,
  firmware/host/SDK, tiempos, evidencias de retorno y ausencia de duplicados.
- [ ] Manual operativo: instalación/distribución a cargo de MP, actualizaciones,
  recuperación administrativa, incidencias y rollback autorizado.
- [ ] Aprobación escrita y plan de distribución comercial acordado. No confundir
  el PR, un check de calidad o una APK firmada con la homologación final.

## Reanudar cuando responda SmartApps

1. Recuperar esta rama y comprobar `git status` antes de editar. No sustituir datos
   locales ni generar una nueva clave si ya existe una custodiada.
2. Registrar una síntesis sin secretos de la respuesta oficial: decisiones,
   referencias, versión de SDK, contrato de retorno y requisitos todavía abiertos.
3. Actualizar matriz y checklist. Si faltan condiciones, conservar el Draft;
   no llenar los vacíos con intents, callbacks o comportamientos supuestos.
4. Acordar el alcance siguiente antes de integrar pagos, crear recursos en MP,
   configurar firmas o instalar en una terminal. Mantener el flujo actual operativo.
5. Ejecutar el plan de sandbox y cerrar evidencias del mismo commit/artefacto.
   Solicitar homologación por el canal oficial; distribución solo tras aprobación
   de MP y autorización del propietario.

Referencias oficiales ya estudiadas:
[SmartApps](https://www.mercadopago.com.mx/developers/es/docs/smartapps/overview),
[kit oficial](https://github.com/mercadopago/point-smartapp-demo-android),
[despliegue y homologación](https://www.mercadopago.com.mx/developers/es/docs/smartapps/deployment).
