# ROFÉ Point — resultados de la entrega local

Fecha local: 5 de noviembre de 2026. Rama: `codex/rofe-point-main-app`.
Base limpia: `6cfb68f002287b1333c2e8dfd933c650f5f5056f`.
Estado: **prototipo compilado y probado localmente; no homologado**.

## Comprobaciones realizadas

| Comprobación | Resultado |
|---|---|
| Prototipo: pruebas JVM / Robolectric | **20 aprobadas**, 0 omitidas / fallidas |
| Candidato Main App: pruebas JVM / Robolectric | **22 aprobadas**, 0 omitidas / fallidas |
| Kiosco existente: pruebas Android, repetidas | **22 aprobadas**, 0 omitidas / fallidas |
| Barista existente: pruebas Android, repetidas | **17 aprobadas**, 0 omitidas / fallidas |
| Lint `prototypeDebug`, `prototypeRelease`, `mainappDebug` | **Sin incidencias** |
| APK `prototypeDebug`, `prototypeRelease`, `mainappDebug` | **Compiladas realmente** |
| APK de pruebas instrumentadas `prototypeDebugAndroidTest` | **Compilada**; no ejecutada en dispositivo |
| `apksigner verify` sobre ambos APK debug entregados | **Firmas válidas** |
| Release Main App sin configuración autorizada | **Bloqueo esperado comprobado** por falta de Client ID |
| AAR externo con hash incorrecto | **Bloqueo esperado comprobado**, no sustituye al SDK oficial |
| Sintaxis de scripts y YAML del workflow | Validada localmente; jobs no ejecutados en GitHub |
| Secretos en fuentes/documentación y archivos sensibles dentro de APK | Sin coincidencias en los patrones revisados; no es una auditoría independiente de seguridad |
| Cambios en `src`, `backend`, `android-kiosk/app`, `android-kiosk/barista` | **Ninguno** |

Total: **81 pruebas Android aprobadas**. No se repitieron las suites web/backend
porque esta entrega no modifica esos componentes. Sus resultados anteriores no
se presentan como pruebas nuevas de esta fase.

El entorno local usa JDK17, Gradle8.11.1, SDK35 y Build Tools34.0.0. Robolectric
ejecutó arranque/recuperación con API31 (Android12), además de las pruebas API34.
La prueba negativa del SDK utiliza un Client ID sintético únicamente en el proceso
Robolectric sin host de Mercado Pago; no se registra una app, contacta un comercio
real ni se simula una aprobación de pago. Verifica que las dependencias del SDK
carguen y que la ausencia del host se traduzca en `UNAVAILABLE`.

Una ejecución ampliada falló por falta de espacio al escribir PNG y temporales.
Se retiraron únicamente los archivos del kit7.2.0 descargados para esta investigación
y se aisló cada clase de pruebas en su proceso JVM para liberar temporales. La
ejecución completa posterior terminó correctamente. La Mac sigue con menos de
1GB libre; no hay una imagen de emulador instalada y no se descargó una nueva.

## Evidencia visual y funcional

Los renderizados Android reales se conservan en:

- `android-kiosk/dist/point/screenshots/waiting-prototype.png`
- `android-kiosk/dist/point/screenshots/offline-prototype.png`
- `android-kiosk/dist/point/screenshots/landscape-prototype.png`
- `android-kiosk/dist/point/screenshots/large-text-prototype.png`

También hay capturas de la variante Main App. Son renders nativos con Robolectric,
**no capturas de la Point física**. El estado de red de la imagen de espera es una
fixture de presentación etiquetada, no una comprobación de conectividad con MP.
La revisión visual confirmó tipografías, contraste, espacios y desplazamiento con
texto ampliado. Se verificaron reconexión automática por callbacks de Android,
recreación, timeout, respuestas duplicadas/tardías y ausencia de navegación externa.

Logs locales ignorados: `.rofe-local/point-build.log`, `point-tests.log`,
`point-final-build.log`, `point-sdk-runtime-test.log`, `point-release-guard.log`,
`point-sdk-hash-guard.log`. Reportes XML/HTML: `android-kiosk/point/build/test-results/`
y `build/reports/`; APKs y evidencias se conservan en `android-kiosk/dist/point/`.
Todos esos artefactos están fuera de Git.

## APKs entregados

Versión inicial1.0.0, versionCode1. Los debug indican `1.0.0-debug`.

| Archivo en `android-kiosk/dist/point/` | Bytes | Uso |
|---|---:|---|
| `ROFE-Point-PROTOTIPO-debug.apk` | 5636610 | Instalable en emulador API31+; no declara HOME |
| `ROFE-Point-PROTOTIPO-UNSIGNED.apk` | 4753810 | Release del prototipo sin firma; no instalable |
| `ROFE-Point-MainApp-CANDIDATO-debug.apk` | 13164894 | Inspección/desarrollo autorizado; declara HOME, **no instalar en Point comercial** |

SHA-256 del prototipo debug:
`a2375b18fe5608b0544f9f63d42c24c32beee59f09095baafc7aa72f941c61ea`.

SHA-256 del candidato debug:
`1146280b20d18d4eb08c03b6d49bdf9d7a8b06a94f1356caf876a8447bd9331b`.

SHA-256 de la release del prototipo sin firma:
`071f56fb2df18462614c3ede422d8bd08350d7c95df24c8951c13eeb8eb1a0c2`.

Ambos debug usan el certificado Android Debug de esta Mac, SHA-256:
`1d0737d29305f83283f8858d483dcfb8046320a432f768d36901bc51ddd32b5f`.
Esa firma permite pruebas, no es el certificado persistente de homologación.
No se creó ni sobrescribió ningún keystore release. El pipeline admite un keystore
exclusivo de Point fuera de Git y sin fallback a debug, pero falta acordar su
custodia/firma definitiva y aportar configuración autorizada antes de ese build.

## Pendientes antes de solicitar aprobación final

1. Contacto formal con negocios y responsable de integración de Mercado Pago.
2. Determinar oficialmente la integración financiera: Orders API externos con Main
   App o arquitectura de SDK que requiera un alcance posterior autorizado. No se ha elegido.
3. N950 de desarrollo y SmartPOS Sandbox habilitados por MP, Client ID autorizado,
   versión de SDK aceptada y contrato de recepción/retorno.
4. Implementación y pruebas del flujo financiero elegido, con retorno tras cada
   resultado, idempotencia y ausencia de doble cobro; probar restricciones durante
   la pantalla nativa y recuperación administrativa autenticada.
5. Firma release persistente, respaldo y revisión de seguridad del paquete final,
   incluido el comportamiento y logs internos del SDK. Confirmar reglas de minificación.
6. Configurar protecciones/secrets del environment CI y ejecutar jobs de GitHub;
   pruebas instrumentadas reales en sandbox y aceptación del equipo MP.
7. Enviar APK final y reportes a MP; aprobación y distribución manual por su equipo.

La matriz detallada y los pasos de instalación eventual están en
[ROFE_POINT_HOMOLOGATION.md](ROFE_POINT_HOMOLOGATION.md). El estudio del plugin y
la respuesta vacía del formulario de SmartApps están en
[ROFE_POINT_PLUGIN_RESEARCH.md](ROFE_POINT_PLUGIN_RESEARCH.md).

**No se instalaron apps, modificó HOME, cambió SELF_SERVICE, ejecutó un cobro,
creó una aplicación en Mercado Pago ni alteró producción durante esta entrega.**
