import { useState } from "react";
import { Copy, MessageCircle, Download, QrCode, ExternalLink, Share2, Check, Smartphone, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

/**
 * ShareLinkCard — Premium "share your eCard" card for the provider dashboard.
 * Generates short alias /p/{slug}, copy, WhatsApp, Email, QR download, native share.
 *
 * Section 46 — every share appends ?ref={slug} so the public eCard view can
 * credit the referrer. Each click also fires a fire-and-forget
 * POST /providers/me/share-event for the dashboard viral KPI card.
 */
export default function ShareLinkCard({ slug, businessName }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!slug) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Friendly short alias + ?ref so referred views can be credited
  const refParam = `?ref=${encodeURIComponent(slug)}`;
  const shortUrl = `${origin}/p/${slug}${refParam}`;
  // Canonical SEO URL (kept clean for the "Ver mi eCard" preview)
  const fullUrl = `${origin}/services/${slug}`;
  const displayUrl = shortUrl.replace(/^https?:\/\//, "").replace(refParam, "");

  // Persuasive Spanish message — first-person, concrete, link last.
  const shareText = `¡Hola! Te dejo mi eCard de ${businessName} en getamano · servicio latino verificado 🌟\n\n${shortUrl}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(shortUrl)}&color=0F172A&bgcolor=FFFFFF`;

  // Fire-and-forget: we never block the share UX on the analytics ping.
  const _trackShare = (channel) => {
    api.post("/providers/me/share-event", { channel }).catch(() => { /* swallow */ });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      toast.success("¡Enlace copiado!");
      _trackShare("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const shareWA = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
    _trackShare("whatsapp");
  };

  const shareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(`Mi negocio en getamano · ${businessName}`)}&body=${encodeURIComponent(shareText)}`;
    _trackShare("email");
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: businessName, text: shareText, url: shortUrl });
        _trackShare("native");
        return;
      } catch (e) {
        // User cancelled share (AbortError) is expected — only log unexpected errors
        if (e?.name !== "AbortError") console.error("native share failed", e);
      }
    }
    copy();
  };

  const downloadQR = () => {
    const a = document.createElement("a");
    a.href = qrSrc; a.download = `${slug}-qr.png`; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
    _trackShare("qr");
    toast.success("Descargando código QR");
  };

  return (
    <div className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-6"
      style={{
        background: "linear-gradient(135deg, #063154 0%, #0A4D5E 60%, #025F67 100%)",
        boxShadow: "0 12px 40px -16px rgba(11,15,46,0.6)",
      }}
      data-testid="share-link-card"
    >
      {/* Decorative gradient blob */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

      <div className="relative flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-orange-300 text-[10px] font-semibold tracking-widest uppercase mb-1">
            <Share2 className="w-3 h-3" /> Tu enlace para compartir
          </div>
          <h3 className="font-display text-lg md:text-xl font-bold text-white leading-tight">Comparte tu eCard en redes</h3>
          <p className="text-xs text-white/60 mt-0.5">Llévate a tus clientes en tu bolsillo. Compárte tu link, QR o eCard donde quieras.</p>
        </div>
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="hidden md:inline-flex items-center gap-1 text-xs text-white/70 hover:text-white" data-testid="share-link-preview">
          Ver mi eCard <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* URL display + copy */}
      <button onClick={copy}
        className="relative w-full flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/95 hover:bg-white text-left transition group"
        data-testid="share-link-copy-btn">
        <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center p-0.5" style={{ backgroundColor: "#EBF8F7" }}>
          <img src="/getamano-logo-mark.png" alt="" className="w-full h-full object-contain" />
        </span>
        <span className="flex-1 min-w-0 truncate text-sm text-slate-900 font-medium" data-testid="share-link-url">{displayUrl}</span>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ${copied ? "bg-green-500 text-white" : "bg-slate-900 text-white group-hover:bg-orange-600"}`}>
          {copied ? <><Check className="w-3 h-3" />Copiado</> : <><Copy className="w-3 h-3" />Copiar</>}
        </span>
      </button>

      {/* Action buttons */}
      <div className="relative mt-3 grid grid-cols-4 gap-2">
        <button onClick={shareWA} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-whatsapp">
          <MessageCircle className="w-4 h-4 text-green-400" />
          <span className="text-[11px]">WhatsApp</span>
        </button>
        <button onClick={shareEmail} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-email">
          <Mail className="w-4 h-4 text-blue-300" />
          <span className="text-[11px]">Email</span>
        </button>
        <button onClick={() => setShowQr(true)} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-qr">
          <QrCode className="w-4 h-4 text-orange-300" />
          <span className="text-[11px]">Código QR</span>
        </button>
        <button onClick={nativeShare} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-native">
          <Smartphone className="w-4 h-4 text-purple-300" />
          <span className="text-[11px]">Compartir</span>
        </button>
      </div>

      {/* QR Modal */}
      {showQr && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowQr(false)} data-testid="qr-modal">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-slate-900">Tu código QR</h3>
              <button onClick={() => setShowQr(false)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center" data-testid="qr-modal-close">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <img src={qrSrc} alt="QR" className="w-full max-w-[280px] mx-auto rounded-2xl bg-white p-3 border border-slate-100" />
            <p className="mt-3 text-xs text-slate-500">Imprímelo en tarjetas, volantes o pega en tu local. Tus clientes lo escanean y llegan directo a tu eCard.</p>
            <button onClick={downloadQR} className="mt-4 w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium flex items-center justify-center gap-2" data-testid="qr-modal-download">
              <Download className="w-4 h-4" /> Descargar QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
