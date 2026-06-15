# POS Motocarro - Estilo "The Coffee" ☕️

Este es el sistema POS (Point of Sale) a la medida para el motocarro de café y pan, diseñado con una estética minimalista, elegante y puramente oscura, inspirada en **The Coffee**.

El sistema consta de dos aplicaciones principales que se sincronizan en tiempo real:
1. **Self-Service POS (iPad del Cliente)**: Interfaz táctil donde el cliente personaliza sus bebidas, ingresa su nombre, y realiza el pago vinculando la terminal física.
2. **Barista Queue Panel (Pantalla de Preparación)**: Tablero Kanban que muestra los pedidos pagados, en preparación, y listos para entrega con chimes de audio integrados.

---

## 🛠️ Arquitectura del Sistema

El sistema está diseñado para ser extremadamente robusto, rápido y tolerante a fallos de red (ideal para el motocarro):

*   **Frontend (React + Vite + TypeScript)**: Construido con CSS nativo de alta fidelidad, animaciones de entrada fluidas, haptics de audio sintéticos generados vía Web Audio API y un sistema de fallback automático a iconos vectoriales SVG si las imágenes de Unsplash fallan en cargar.
*   **Backend (Node.js + Express + TypeScript)**: Servidor liviano optimizado para desplegarse gratis en **Render**. Administra las colas de pedidos del día en memoria RAM e interactúa como proxy seguro con la API Cloud de Mercado Pago.
*   **Sincronización SSE (Server-Sent Events)**: En lugar de WebSockets tradicionales, usamos SSE para una comunicación instantánea y unidireccional del servidor a los navegadores. Esto garantiza una excelente estabilidad, consume menos batería del iPad y funciona de forma transparente sobre hotspots de datos móviles (4G/5G).
*   **Resiliencia Offline**: Si el servidor se apaga o pierde conexión a internet, el POS entra automáticamente en modo offline local. Utiliza `localStorage` en el navegador como base de datos de respaldo para que la operación del motocarro nunca se detenga.

---

## ⚙️ Configuración del Entorno (Variables `.env`)

Crea un archivo `.env` dentro de la carpeta `backend/` para configurar tus credenciales:

```env
PORT=3000
MERCADO_PAGO_ACCESS_TOKEN=
POINT_DEVICE_ID=tu_numero_de_serie_de_la_point_smart_2
```

> 💡 **Modo Simulación**: Si no configuras las variables anteriores (o dejas valores de ejemplo), el servidor entrará automáticamente en **modo simulación**. En este modo, el iPad mostrará botones para simular un pago exitoso o rechazado, ideal para probar la interfaz y el flujo completo sin usar tarjetas bancarias reales.

---

## 🚀 Cómo Ejecutar en Local

### 1. Iniciar el Servidor Backend
Entra en la carpeta del backend, instala las dependencias y arranca el servidor:
```bash
cd backend
npm install
npm run build
npm start
```
El servidor escuchará por defecto en el puerto `3000` (e.g. `http://localhost:3000`).

### 2. Iniciar el Frontend (Vite)
En la raíz del proyecto, arranca el servidor de desarrollo exponiéndolo a la red local para conectarte desde el iPad:
```bash
npm install
npm run dev -- --host
```
Vite te mostrará la URL de tu red local (ejemplo: `http://192.168.1.42:5173`). 

📱 **Acceso desde el iPad**: Abre Safari en tu iPad, entra a la dirección de red local que te dio Vite, presiona el botón "Compartir" de Safari y selecciona **"Agregar a Inicio"** para instalar la app como una PWA nativa en pantalla completa sin barras de navegación del navegador.

---

## 💳 Vinculación con Mercado Pago Point Smart 2

El backend utiliza la API de **Payment Intents** de Mercado Pago para despertar la terminal física de forma inalámbrica a través de internet:

1. El cliente presiona **"CONFIRMAR Y PAGAR"** en el iPad.
2. El iPad envía la orden al backend (`POST /api/orders`).
3. El backend llama a la API de Mercado Pago y despierta tu terminal **Point Smart 2** (`POST /devices/{device_id}/payment-intents`).
4. La terminal física se enciende mostrando el monto total e indicando "Inserte o aproxime su tarjeta".
5. El cliente realiza el pago físicamente en la terminal.

### Configuración del Webhook para Conciliación en Tiempo Real

Para que el iPad y la pantalla de Barista se actualicen inmediatamente cuando la terminal apruebe el cobro, debes configurar un Webhook en tu panel de desarrolladores de Mercado Pago:

1. Ve a tu [Panel de Desarrolladores de Mercado Pago](https://developers.mercadopago.com/).
2. Crea una aplicación o selecciona la existente.
3. Ve a la sección **Webhooks** (Notificaciones IPN / Webhooks).
4. Configura la **URL de producción** de tu backend desplegado en Render añadiendo el endpoint del webhook:
   `https://tu-app-en-render.onrender.com/api/webhooks/mercadopago`
5. En los eventos de notificación, activa la casilla **"payment"** (o "pagos").
6. Guarda los cambios. ¡Listo! Cada transacción exitosa en la terminal Point enviará una notificación HTTPS a tu backend, la cual se transmitirá al instante al iPad y Barista mediante SSE.
