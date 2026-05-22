import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * RouteErrorBoundary — wraps the <Routes> tree so a single page crash
 * doesn't unmount the global chrome (Header, BottomNav, install banners).
 *
 * React Router 6 has its own `errorElement` mechanism but only when using
 * `createBrowserRouter`. We use `<BrowserRouter>` here, so a class boundary
 * is the right primitive.
 */
export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", error, info);
    try {
      if (typeof window !== "undefined" && window.posthog) {
        window.posthog.capture("ui_error", {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
          path: window.location.pathname,
        });
      }
    } catch (_e) { /* ignore */ }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12" data-testid="route-error-boundary">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-lg p-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-orange-600" />
          </div>
          <h2 className="font-display font-bold text-xl text-slate-900">Algo salió mal en esta pantalla</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            No te preocupes — el resto de la app sigue funcionando. Refresca o vuelve al inicio.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => { this.reset(); window.location.reload(); }}
              className="px-5 py-2.5 rounded-full text-white font-semibold inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: "#025F67" }}
              data-testid="route-error-reload"
            >
              <RefreshCw className="w-4 h-4" /> Refrescar
            </button>
            <Link
              to="/"
              onClick={this.reset}
              className="px-5 py-2.5 rounded-full border border-slate-300 text-slate-800 font-semibold inline-flex items-center justify-center gap-2 hover:bg-slate-50"
              data-testid="route-error-home"
            >
              <Home className="w-4 h-4" /> Inicio
            </Link>
          </div>
          {process.env.NODE_ENV !== "production" && (
            <pre className="mt-5 text-left text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3 overflow-auto max-h-40">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
