# ROFÉ · instalación PWA en Android M10

Auditoría del 4 de noviembre de 2026. Esta intervención corrige la instalación y crea la entrada `/kiosk`, reutilizando el POS existente. El build verificado y un despliegue público son evidencias diferentes.

## Diagnóstico reproducido

La dirección facilitada para el intento de instalación es `http://192.168.0.8:5173`. Al abrirla en Chromium se obtuvo `isSecureContext: false` y `serviceWorker` no disponible. Es un servidor de desarrollo Vite accedido por HTTP desde la LAN. La excepción de seguridad para `localhost` y loopback corresponde al mismo dispositivo; no convierte la IP del ordenador en un origen seguro para Android. Este origen no permite verificar una instalación PWA independiente. [Criterios de instalación de Chrome](https://web.dev/articles/install-criteria).

El dominio indicado en el campo homepage del repositorio es `https://rofe.vercel.app`. Tiene HTTPS válido y su raíz responde 200, pero la versión actualmente publicada no enlaza un manifest. `/kiosk`, `/manifest.webmanifest`, `/sw.js`, `/icon-192.png` y `/icon-512.png` respondieron 404, sin redirects. Por tanto, ese despliegue antiguo tampoco contiene la PWA que existe en el workspace.

La opción «Instalar» del navegador no prueba por sí sola que el sitio tenga un manifest válido ni que Android vaya a crear un WebAPK. Chrome ha cambiado los criterios de su menú, y la presencia de un fetch handler ya no es un requisito universal para esa opción. ROFÉ mantiene un worker real para su funcionamiento offline. [Cambios en Chrome](https://developer.chrome.com/blog/update-install-criteria).

## Correcciones

| Elemento | Configuración comprobada en el build |
| --- | --- |
| Manifest | `/manifest.webmanifest`, JSON válido, enlazado desde el HTML |
| Content-Type | `application/manifest+json`; regla explícita en Vercel |
| name / short_name | `ROFÉ · Terminal de autoservicio` / `ROFÉ` |
| Identidad | `id: /`, conservando la identidad anterior basada en la raíz |
| Inicio | `start_url: /kiosk` |
| Scope | `/`; incluye `/kiosk` y los recursos de la app |
| Ventana instalada | `display: standalone` |
| Orientación | `landscape` |
| Colores | `theme_color` y `background_color`: `#111311` |
| Iconos normales | PNG reales 192×192 y 512×512, `purpose: any` |
| Iconos adaptables | PNG propios 192×192 y 512×512, `purpose: maskable`, opacos |
| Área segura maskable | Logotipo dentro del círculo central de radio 40 % del ancho |
| Recursos | Todas las rutas de manifest, worker, iconos y precarga responden 200 sin redirects en el build servido |
| Direcciones de desarrollo | Ninguna dentro del manifest; las rutas son relativas al origen |
| Worker | `/sw.js`, JavaScript válido con versión del build, scope raíz explícito |
| Registro | Sólo en producción y contexto seguro; detecta tanto carga inicial como documento ya cargado |
| Error de registro | Estado visible en kiosco y error de consola identificable; timeout de activación de 60 s |
| Precarga | Shell, `/kiosk`, JS, CSS, fuentes e imágenes; nunca APIs privadas |
| Actualizaciones | Esperan a que las pestañas anteriores se cierren; no interrumpen un cobro mediante activación forzada |
| Consola PWA | Sin errores de manifest, worker o instalación en la prueba del build |

Los iconos se renderizan desde el SVG de marca mediante un generador reproducible. Los antiguos PNG estaban pixelados y el de 512 estaba declarado `any maskable` pese a tener esquinas transparentes. Esto se corrigió como defecto de adaptación del icono; no se atribuye a ese detalle el fallo principal de instalación. [Área segura maskable](https://web.dev/articles/maskable-icon).

Mantener un `id` estable permite cambiar el punto de arranque sin asignar otra identidad a la aplicación. La actualización efectiva de una instalación previa depende del ciclo de actualización de Chrome. [Identidad del manifest](https://developer.chrome.com/docs/capabilities/pwa-manifest-id).

## Entrada instalada y arquitectura

`AppRouter` distingue `/pedir`, `/kiosk` y la aplicación habitual. `KioskPage` envuelve el mismo `App`: no duplica catálogo, precios, carrito, pagos, inventario ni backend. En un arranque de `/kiosk`, el POS usa las credenciales del dispositivo autorizado; una sesión anterior de equipo no abre automáticamente administración ante el próximo cliente. El acceso de equipo sigue siendo explícito.

La pequeña franja de instalación sólo aparece en modo navegador y se oculta cuando el sistema informa `display-mode: standalone` o `fullscreen`. Utiliza el prompt nativo cuando Chrome lo ofrece; no convierte «Crear acceso directo» en una instalación ni muestra éxito por haber aceptado el diálogo. La terminal ocupa `100dvh` y utiliza la adaptación responsive existente. El manifest solicita landscape; el comportamiento de orientación y de las barras del sistema debe comprobarse en la M10.

## Archivos

- Manifest/HTML/hosting: `public/manifest.webmanifest`, `index.html`, `vercel.json`.
- Iconos: `public/favicon.svg`, cuatro PNG `icon-*` y `scripts/generate-pwa-icons.mjs`.
- Worker y build: `public/sw.js`, `scripts/build-pwa.mjs`, `scripts/validate-pwa.mjs`, `package.json`.
- Registro y arranque: `src/services/pwa.ts`, `src/main.tsx`, `src/AppRouter.tsx`, `src/components/KioskPage.tsx`, `src/styles/kiosk.css`, opción de arranque en `src/App.tsx`.
- Verificación: `scripts/audit-pwa.mjs`, `e2e/pwa.spec.ts`.

## Repetir las verificaciones

```bash
npm run build
npm run validate:pwa
npm run preview -- --host 127.0.0.1 --port 4273
# En otra terminal: únicamente valida el build local.
npm run audit:pwa -- --local --url http://127.0.0.1:4273/kiosk

# Tras publicar: esta es la auditoría del servidor real.
npm run audit:pwa -- --url https://rofe.vercel.app/kiosk

npm run verify
npm run test:e2e
```

El build ejecuta la generación y validación PWA automáticamente. La comprobación estática revisa dimensiones reales de PNG, opacidad/área segura, rutas de todos los archivos, scope, inicio y plantilla compilada del worker. La auditoría HTTP comprueba estado, MIME y redirects; Chromium con Android emulado comprueba el parser, registro, control y arranque offline. Una respuesta vacía de `Page.getInstallabilityErrors` no basta: también se exige un manifest válido y los recursos reales. El despliegue antiguo ilustra esta diferencia.

Resultados de esta intervención:

| Prueba | Resultado |
| --- | --- |
| Lint y tipos frontend/backend | PASS |
| Unitarias frontend/backend | 9 + 42 pasan |
| Recorridos de navegador | 28 pasan; 3 específicos de PWA |
| Build de producción y validación estática | PASS; 4 iconos verificados y 39 rutas precargadas |
| Auditoría del build servido por loopback | PASS; recursos 200 sin redirects, MIME correctos, worker activado/controlando y `/kiosk` offline |
| Consola durante la prueba PWA | Sin errores de manifest/worker/instalación; la pérdida de red simulada sí produce el fallo de recurso de red esperado |
| IP LAN suministrada | Contexto inseguro; worker no disponible |
| `https://rofe.vercel.app/kiosk` publicado anteriormente | FAIL; página, manifest y worker 404 |
| WebAPK real en la M10 | Pendiente de publicación HTTPS y prueba física |

## Publicación e instalación en la M10

La ruta final de instalación es **`/kiosk` en el origen HTTPS donde se publique este build**. Para el dominio indicado en el repositorio, será **https://rofe.vercel.app/kiosk**. Al terminar esta auditoría esa URL todavía responde 404: no se ha publicado ni reemplazado el despliegue existente. El acceso LAN permanece como desarrollo, de acuerdo con la instrucción anterior de mantener el proyecto local.

Antes de instalar:

1. Publicar el directorio `dist` generado con su manifest, PNG y `sw.js`, conservando las reglas de Vercel. El proveedor debe servir el certificado HTTPS válido y permitir acceso público a esos recursos, sin una pantalla de autenticación del hosting.
2. Ejecutar la auditoría contra la URL HTTPS final y exigir `PASS`. El backend también debe usar HTTPS y permitir el origen final para que la operación del POS funcione; eso es independiente de instalar el shell.
3. Abrir **esa URL HTTPS terminada en `/kiosk`** en Chrome de la M10. No usar la dirección `192.168.0.8:5173` ni sustituir el host por `localhost` en la tablet.
4. En Chrome, elegir **Instalar y crear acceso directo → Instalar**, o «Instalar ROFÉ» según la versión. Completar el diálogo de instalación. Si sólo está disponible «Crear acceso directo», la instalación todavía no quedó acreditada.
5. Abrir ROFÉ desde el menú de aplicaciones de Android. Comprobar que abre el kiosco, sin barra URL ni pestañas de Chrome, y que aparece en Ajustes → Aplicaciones. Autorizar esa terminal si es su primera visita al origen publicado.
6. Verificar orientación, teclado virtual, conectividad, recuperación de un pedido y actualización tras cerrar las pestañas anteriores, en la tablet física.

La denominación exacta del menú depende de la versión de Chrome. [Instrucciones actuales de Chrome Android](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=es).

## Lo que depende del dispositivo

La prueba de Chromium no instala un WebAPK real en Android. Chrome solicita su generación a un servicio de empaquetado y Android realiza la instalación. Ese paso, la versión concreta de Chrome/Android, el espacio disponible, las políticas de administración y la conectividad del instalador necesitan comprobación en la M10. Si falla tras pasar la auditoría HTTPS, recopilar versión, URL y error de instalación exactos, más logs de depuración remota, antes de atribuirlo al manifest. [Arquitectura WebAPK de Chromium](https://github.com/chromium/chromium/blob/main/components/webapps/docs/android_architecture.md).

No se desactivó validación TLS, no se marcaron orígenes inseguros como seguros y no se utilizaron flags para forzar la instalación. Tampoco se borraron IndexedDB, sesiones u órdenes pendientes para resolver el fallo. El bloqueo real de Android requiere la configuración posterior del dispositivo; `standalone` no es un mecanismo de seguridad ni Lock Task.
