import { X, ExternalLink, Loader2 } from "lucide-react";
import { useEffect } from "react";

/**
 * ECardPreviewModal — Section 44.
 *
 * Lightweight in-app preview of the provider's public eCard. Renders the full
 * `/provider/{slug}` page inside an iframe so the modal is always 1:1 with
 * what visitors see — no duplicate render logic to maintain.
 *
 * Behavior:
 *  · Esc closes.
 *  · Backdrop click closes.
 *  · Body scroll is locked while open.
 *  · A footer link gives the option to open in a real tab if they want to share.
 */
export default function ECardPreviewModal({ open, onClose, slug }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !slug) return null;
  const url = `/provider/${slug}`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6"
      onClick={onClose}
      data-testid="ecard-preview-backdrop"
    >
      <div
        className="bg-white w-full max-w-5xl h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="ecard-preview-modal"
        style={{ animation: "ecard-preview-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        <style>{`@keyframes ecard-preview-in{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
            <h3 className="text-sm font-bold text-slate-900 truncate">Vista previa de tu eCard</h3>
            <code className="hidden sm:inline-block text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{url}</code>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-teal-700 px-3 py-1.5 rounded-full border border-slate-200"
              data-testid="ecard-preview-open-tab"
            >
              Abrir en pestaña <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-600"
              data-testid="ecard-preview-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 relative bg-slate-50">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" data-testid="ecard-preview-loader">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
          <iframe
            src={url}
            title="eCard preview"
            className="w-full h-full border-0 relative bg-white"
            data-testid="ecard-preview-iframe"
          />
        </div>
      </div>
    </div>
  );
}
