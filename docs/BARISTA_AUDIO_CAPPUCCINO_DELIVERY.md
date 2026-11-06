# Audio de pedidos y foto de Capuccino — 5-nov-2026

## Audio entregado por el dueño

Se integra `src/assets/audio/nuevo_pedido.mp3` como reemplazo del oscilador anterior.
Es el archivo suministrado, sin cambios de contenido: SHA-256
`1bd9cf90e251f510988888ad6279ba6d2bbb75939b0884de1e7b4513d999e463`,
40,760 bytes, mono 44.1 kHz, aproximadamente 1.49 segundos.

Se descarga una vez, se decodifica y reutiliza mediante Web Audio. La activación
conserva el gesto de inicio de turno/«Activar sonido» y la recuperación tras
suspensión. Un error de descarga permite volver a intentarlo; mientras no se
pueda reproducir, el pedido no se registra como avisado. El historial por UUID y
las reglas de pedidos pagados/efectivo pendiente permanecen vigentes. Vite emite
un nombre con hash y la PWA incluye el recurso en su caché de archivos estáticos.

Las pruebas unitarias verifican descarga única, fallo/reintento, suspensión y
reproducción fallida. El E2E descarga el MP3 real, compara su SHA-256, registra
`AudioBufferSourceNode.start()` y comprueba su duración decodificada, más los casos
existentes de duplicados, concurrencia, reconexión y recarga de sesión. Chromium
headless silencia la salida física: esto verifica reproducción programada real,
**no certifica volumen ni audibilidad en la tablet**.

## Capuccino

La auditoría detectó un producto adicional con ID real `1781621332807`, ausente de
las doce fotografías originales. Se generó realmente una imagen independiente con
`image_gen.imagegen`, se revisó visualmente y se importó mediante el pipeline
existente. No se reutilizó la foto de Latte ni se cambiaron datos del catálogo real.

- Original: `scripts/product-images/originals/1781621332807.png`, 1254×1254.
- WebP: 384 px / 12,922 bytes; 640 px / 32,870 bytes; 960 px / 68,950 bytes.
- Archivo y SHA de origen, herramienta y prompt: `scripts/product-images/provenance.json`.
- Dirección y prompt del producto: `scripts/product-images/sources.json`.
- Integración: `src/kiosk/productImages.json`, estado `approved`; ahora 13 productos.

Taza crema, fondo cálido neutro, luz suave desde la izquierda, espuma con canela
según la descripción del catálogo. Las doce entradas y variantes anteriores se
conservaron idénticas. El resolver compartido la muestra en POS, kiosco, QR y
vista de Administración; el modal usa la variante de 960 px. Una subida futura
desde Administración puede sustituirla conforme a la prioridad temporal existente.

El E2E en ambos formatos M10 verifica las 13 imágenes locales sin peticiones
externas, precarga de las 13 durante bienvenida, imagen exclusiva de Capuccino y
modal con cotización del backend aislado. Ese fixture usa la receta de Latte ya
existente en pruebas: **no define ni sustituye la receta de producción**.

Capturas emuladas (datos de prueba):
`docs/evidence/catalog-13-m10-landscape.png`, `catalog-13-m10-portrait.png`,
`cappuccino-m10-landscape.png` y `cappuccino-m10-portrait.png`.
La validación posterior de producción no confirma pedidos ni ejecuta cobros.

## Operación

El shell Android release carga ROFÉ por HTTPS; estos cambios web no requieren
reinstalar las APK ni borrar datos. Recargar la app después del despliegue y
comprobar «Sonido activo» al iniciar turno. El volumen multimedia de la M10 y
la prueba audible con un pedido normal autorizado se validan físicamente.
