import { lazy, Suspense } from 'react';

const PickupPage = lazy(() => import('./components/PickupPage'));
const PosApp = lazy(() => import('./App'));
const BaristaPage = lazy(() => import('./components/BaristaPage'));
const KioskPage = lazy(() => import('./components/KioskPage'));

export default function AppRouter() {
  const publicPickup = window.location.pathname === '/pedir' || window.location.pathname.startsWith('/pedir/');
  const barista = window.location.pathname === '/barista' || window.location.pathname === '/barista/';
  const kiosk = window.location.pathname === '/kiosk' || window.location.pathname === '/kiosk/';
  return <Suspense fallback={<main className="app-loading">Abriendo ROFÉ…</main>}>{publicPickup ? <PickupPage /> : barista ? <BaristaPage /> : kiosk ? <KioskPage /> : <PosApp />}</Suspense>;
}
