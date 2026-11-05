import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import AppRouter from './AppRouter.tsx'
import { registerPwa } from './services/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><AppRouter /></AppErrorBoundary>
  </StrictMode>,
)

registerPwa()
