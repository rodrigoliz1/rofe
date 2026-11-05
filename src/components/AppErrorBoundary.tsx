import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ROFE UI error', { message: error.message, componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="app-fatal" role="alert">
          <p>ROFÉ · Recuperación</p>
          <h1>No pudimos mostrar esta pantalla</h1>
          <p>La venta no se borró. Recarga la aplicación para recuperar la sesión y las operaciones pendientes.</p>
          <button type="button" onClick={() => window.location.reload()}>Recargar ROFE</button>
        </main>
      );
    }
    return this.props.children;
  }
}
