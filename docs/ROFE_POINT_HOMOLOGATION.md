# ROFÉ Point — compatibilidad y homologación

Seguimiento por requisitos cumplidos, trabajo sin terminal, dependencias de MP,
pruebas de sandbox y expediente de revisión:
[ROFE_POINT_HOMOLOGATION_CHECKLIST.md](ROFE_POINT_HOMOLOGATION_CHECKLIST.md).

Consulta técnica: 5 de noviembre de 2026. Las capacidades «pendientes» no se presentan
como probadas por un test con dobles, una compilación o un render local.

## Matriz Point Smart 2 / Newland N950

| Capacidad | Evidencia / estado | Validación necesaria |
|---|---|---|
| Aplicación Android nativa como Main App | Documentada; módulo Kotlin preparado | Alta privada y aprobación de ROFÉ Point en México |
| N950, Android 12 / minSdk31, AOSP | Documentado; mínimo declarado, sin servicios Google | SO/firmware real y versión sandbox de N950 entregada por MP |
| Pantalla ROFÉ de espera | Implementada y comprobable localmente | Legibilidad, densidad, suspensión y horas continuas en N950 de desarrollo |
| Launcher HOME | Declaración oficial aislada a `mainapp` | MP configura/autoriza la predeterminada; no se ha cambiado ninguna |
| SDK oficial 7.3.1 | AAR público verificado, adaptador compila | Confirmar versión admitida, Client ID, sesión y host de desarrollo |
| Órdenes externas desde Kiosco | Funcionan según comprobación física del propietario; código intacto | Certificar que siguen funcionando con Main App activa |
| SELF_SERVICE con Main App | Factibilidad comunicada por soporte según propietario | Aprobación escrita para cuenta, N950, México y firmware concretos |
| Callback de SDK para una orden externa | No se encontró contrato público que lo garantice | Proveer API/evento autenticado o confirmar que el host gestiona todo el retorno |
| Vuelta tras pago/cancelación/expiración | Activity se recupera cuando Android le devuelve el control | Demostrar retorno del host real en los tres casos y después de reinicio |
| No exponer Smart Launcher | Sin salidas administrativas en nuestra UI | Restricción integral a cargo de MP; no garantizada por fullscreen |
| Navegación durante pago nativo | Barras pueden reaparecer según docs oficiales | Probar Atrás/Home/Recientes, gestos, notificaciones y panel rápido |
| Conectividad | Observación validada de Android y recuperación implementadas | Wi-Fi, red cautiva, datos móviles y host sin servicio en N950 |
| Diagnóstico del terminal | Solo consulta oficial, no persiste serial ni datos de pago | Verificar respuesta y ausencia de logs sensibles del SDK |
| Administración | No hay funciones administrativas propias | Procedimiento de soporte autenticado y reversión oficial sin reset |
| Actualización y distribución | Gradle/CI y firma externa preparados | Revisión, keystore persistente y distribución privada por MP |

Fuentes: [SmartApps](https://www.mercadopago.com.mx/developers/es/docs/smartapps/overview),
[restricciones N950 y SDK](https://www.mercadopago.com.mx/developers/es/docs/smartapps/restrictions),
[ambiente y HOME](https://www.mercadopago.com.mx/developers/es/docs/smartapps/development-environment),
[fullscreen y sus límites](https://www.mercadopago.com.mx/developers/es/docs/smartapps/terminal-features/configure-full-screen).

## Requisitos pendientes que debe proporcionar o confirmar Mercado Pago

1. Responsable técnico/comercial, registro de Main App privada ROFÉ Point, Client ID
   y permiso para la modalidad desatendida propuesta. No sustituir automáticamente
   las credenciales del backend por las de esta nueva aplicación.
2. N950 de desarrollo con depuración permitida y SmartPOS sandbox actualizado y
   configurado por MP. No usar el Point comercial como dispositivo de desarrollo.
3. SDK y documentación vigentes, condiciones de uso/distribución y reglas de
   minificación. El binario público revisado no concede homologación por sí mismo.
4. Contrato exacto para **Orders API externos + SELF_SERVICE + Main App**: quién
   recibe la orden, cómo aparece la UI financiera, cómo se devuelve el control,
   si existen callbacks para órdenes externas y cómo se autentican/validan.
5. Identificar oficialmente SmartPOS y Mediator App en este firmware y establecer
   el launcher esperado durante reposo/pago. El AAR declara queries a ambos paquetes;
   eso no autoriza a elegir uno a ciegas ni demuestra cuál debe ser HOME.
6. Restricciones fuera de la Activity: barras, gestos, accesos a menús, notificaciones,
   bloqueo del dispositivo, accesos físicos y reinicio. Procedimiento administrativo
   autenticado, trazable y reversible que no exponga esos accesos a clientes.
7. Requisitos de firma, identidad, actualización, preconfiguración y distribución
   privada. Proporcionar identificadores del comercio/terminal por canal seguro,
   sin publicarlos en el repositorio ni alterarlos para esta prueba.

No se ha solicitado ni almacenado un access token de producción en la aplicación.
Si se requiere identidad del personal o información de cuenta, definir OAuth/SSO
con validación en backend y protección antirreplay; actualmente no hay esa función.

## Procedimiento propuesto

Antes de integrar pagos, MP y el propietario deben resolver una decisión que sigue
abierta: conservar Orders API con retorno oficial a Main App, o diseñar una integración
financiera diferente usando el SDK. La segunda opción necesitaría un alcance autorizado,
conciliación con backend e impedir explícitamente el doble iniciador de cobros. No se
implementa ni se ensaya sobre producción en esta fase. Si ninguna opción cumple las
restricciones del terminal, se conserva la integración comercial actual.

1. Entregar a MP la arquitectura, matriz, alcance de permisos, versión/hash del
   SDK y APK del prototipo. Acordar por escrito los requisitos anteriores.
2. En una rama de integración, implementar exclusivamente el contrato oficial
   faltante, con pruebas del adaptador y sin añadir un segundo iniciador de cobros.
3. Probar en N950 de desarrollo/sandbox autorizado: inicio en frío, HOME, reinicio,
   pérdida y retorno de red, bloqueo/suspensión y recuperación de la interfaz.
4. Enviar desde un Kiosco de pruebas al entorno de pruebas central: una orden,
   varias órdenes y reintentos. Confirmar un único flujo nativo por orden, importe
   correcto, aprobación/rechazo/cancelación/expiración, idempotencia, webhooks y
   conciliación. No basarse en `onResume` para marcar un pedido pagado.
5. Evaluar salida hacia Launcher/ajustes en cada pantalla financiera y no financiera,
   pulsaciones largas, gestos y combinaciones físicas. Si MP no garantiza el bloqueo
   requerido, documentar el límite y no aprobar uso desatendido.
6. Confirmar ruta administrativa autorizada y rollback oficial a la interfaz previa
   **sin** reset, desvinculación, cambio de modo o pérdida de datos. Ensayarlo en el
   equipo de desarrollo, nunca improvisarlo en producción.
7. Preparar keystore exclusivo persistente de Point, respaldo cifrado y custodia;
   compilar candidato release no depurable, sin backup ni tráfico claro, firmado
   y verificado con `apksigner`. Adjuntar SHA-256, versión incremental y reportes.
8. Enviar el APK (<50 MB) al representante de MP. La homologación y la distribución
   privada de Main Apps corresponden a su equipo. Obtener aceptación explícita del
   conjunto N950 + Orders API + SELF_SERVICE, no solo de la pantalla de espera.
9. Solo tras aprobación oficial y autorización del propietario, programar instalación
   comercial con respaldo de configuración, ventana sin cobros pendientes y plan de
   reversión. Cualquier prueba real de importe/movimiento se autoriza por separado.

El proceso de revisión, certificado persistente y distribución manual de Main Apps
está descrito en [despliegue oficial](https://www.mercadopago.com.mx/developers/es/docs/smartapps/deployment).

## Instalación eventual en entorno permitido

**Prototipo normal:** usar un emulador API31 o superior. El script
`android-kiosk/scripts/point-emulator-smoke.sh` verifica que sea virtual y ejecuta
solo la variante `prototypeDebug`, que no declara HOME. No necesita credenciales.
No utilizar comandos genéricos `adb install` con una Point comercial conectada.

**Main App candidata:** solamente N950 de desarrollo habilitado por MP, con su
procedimiento de sandbox y autorización para instalar/seleccionar HOME. La APK
debug compilada sin Client ID sirve para inspección del paquete, no para cobrar.
No desinstalar ni sustituir SmartPOS/Mediator, no ejecutar `set-home-activity`,
no cambiar SELF_SERVICE y no elegir «Siempre» en un selector del equipo comercial.

**Producción:** instalación/distribución y selección de interfaz a cargo de MP
según su aprobación. Conservar el APK previo y su firma, verificar identidad/hash
y coordinar recuperación administrativa. No se ejecutó ninguno de estos pasos en
esta entrega.
