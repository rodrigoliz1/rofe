# Desarrollo local en la Mac

Configurado el 5 de noviembre de 2026 desde `claude/kiosk-production-hardening`, conservado en la rama local `codex/rofe-development`.

## Arranque y direcciones

Desde la raíz del repositorio:

```bash
npm run dev
```

| Superficie | Dirección / acceso |
|---|---|
| POS | http://127.0.0.1:5173/ |
| Kiosco | http://127.0.0.1:5173/kiosk |
| Barista / KDS | Misma raíz → Equipo → cuenta BARISTA; también desde Administración → Barra |
| Administración | Misma raíz → Equipo → cuenta ADMIN/MANAGER |
| Menú QR | http://127.0.0.1:5173/pedir (sin cobro Stripe) |
| Salud del backend | http://127.0.0.1:3000/health |
| Disponibilidad local | http://127.0.0.1:3000/ready |

Barista y administración son vistas con acceso por rol, no tienen rutas `/barista` o `/admin`. Antes de registrar la terminal también está disponible «Entrar con una cuenta de equipo». Evita alternar entre localhost y 127.0.0.1: cada origen tiene su propia IndexedDB y registro de terminal.

La clave de registro está en `DEVICE_ENROLLMENT_SECRET` del perfil privado. Se conservaron los hashes de las cuentas `admin@rofe.local` y `barista@rofe.local`; usa las contraseñas existentes. No se recuperaron ni sustituyeron contraseñas. El registro de terminal requiere una única autorización local en el navegador. No copies estas claves a mensajes ni al frontend.

## Aislamiento

- `backend/.env`: archivo original conservado; contiene integraciones reales y **no debe usarse para navegar/pruebas locales**.
- `backend/.env.development.local`: perfil privado ignorado por Git, con permisos 0600. Se creó desde el ejemplo reutilizando únicamente secretos JWT, hashes de usuarios y clave de registro disponibles.
- `.env.local`: frontend por mismo origen; `VITE_API_URL` vacío y proxy de Vite hacia 127.0.0.1:3000.
- `.rofe-local/db.json`: copia inicial de la semilla `backend/db.json`; los arranques siguientes conservan la copia. No se descargan datos de Supabase.
- `.rofe-local/devices.json`: hashes de dispositivos exclusivos del entorno local. Las sesiones de personal y cambios de usuarios del adaptador de desarrollo viven en memoria y se reinician con el backend; los usuarios bootstrap y dispositivos se recuperan.

El lanzador fuerza modo development, escucha sólo en loopback, fija puertos 3000/5173, comprueba conflictos y borra del entorno de sus procesos las configuraciones de Supabase, Mercado Pago, Stripe y Vercel. Activa la simulación de Point únicamente en este perfil. Los pagos locales no prueban una terminal real; Stripe permanece deshabilitado.

Vite deniega el acceso HTTP a `backend/` y `.rofe-local/`, y no observa los datos del navegador ni los builds E2E. `/ready` también está disponible mediante el proxy del frontend.

No uses `npm --prefix backend run dev` directamente con el `.env` original. Para detener los dos procesos usa Ctrl+C en la terminal de `npm run dev`. Los puertos ocupados producen un error; no se cambia silenciosamente a otro origen.

## Preparar otra Mac

Node >=22.12 y npm >=10. En esta Mac: Node 24.14.1 y npm 11.11.0.

```bash
npm ci
npm --prefix backend ci
cp .env.example .env.local
cp backend/.env.example backend/.env.development.local
chmod 600 backend/.env.development.local
```

Completa secretos locales independientes (JWT diferentes de 32+ caracteres, clave de registro de 16+ caracteres y hashes bcrypt de admin/barista). Usa `openssl rand -base64 48` y el script `backend/scripts/hash-password.cjs`. Nunca sobrescribas un archivo privado ya existente. El lanzador rechaza un perfil sin esas claves y fuerza el aislamiento aun si el shell tiene credenciales remotas.

## Verificar

```bash
npm run verify
npm --prefix backend run lint
npm run test:e2e
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" npm --prefix backend run test:db
npm audit
npm --prefix backend audit
```

PostgreSQL sólo se necesita para la suite SQL: crea un clúster temporal propio, usa socket privado sin TCP, aplica 001–008 y lo elimina al terminar. El desarrollo normal usa JSON. E2E usa puertos 3100/4173 y una carpeta temporal distinta por ejecución; nunca la base/dispositivos de desarrollo. La PWA se valida en los builds de E2E; el servidor Vite no registra el service worker.
