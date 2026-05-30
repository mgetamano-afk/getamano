import BrandMark from "./BrandMark";
import { useEffect, useRef, useState } from "react";
import { Copy, MessageCircle, Download, QrCode, ExternalLink, Share2, Check, Smartphone, Mail, X, Facebook, MessageSquare, Twitter, Instagram, Printer, Image as ImageIcon, Search, PartyPopper, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";

/**
 * ShareLinkCard — Premium "share your eCard" card for the provider dashboard.
 * Generates short alias /p/{slug}, copy, WhatsApp, Email, QR download, native share.
 *
 * Section 46 — every share appends ?ref={slug} so the public eCard view can
 * credit the referrer. Each click also fires a fire-and-forget
 * POST /providers/me/share-event for the dashboard viral KPI card.
 *
 * V16 (Social Preview) — adds:
 *   - Live preview of how the link looks when pasted in FB/IG/X (uses the
 *     `/api/og-image/{slug}.png` rendered server-side with the first gallery
 *     photo → AI bg → gradient fallback).
 *   - "Publicar en Story" button: Web Share API with file payload (opens
 *     the OS share sheet — user picks Instagram Story / Facebook Story /
 *     WhatsApp Status and the image is loaded directly into that app's
 *     composer). Falls back to download on desktop.
 *   - Validators that open the link in Facebook Sharing Debugger /
 *     Twitter Card Validator so the provider can verify the preview is
 *     scraped correctly before publishing.
 *
 * V16.1 — when invoked with `celebrationKind="new_ecard"` or `"verified"`
 *   (driven by `?celebrate=...` URL param on the dashboard), the card
 *   renders a hero celebration banner at the top with confetti emoji
 *   and a celebratory copy + auto-scrolls itself into view so the
 *   provider's first instinct after paying / getting verified is to
 *   share.
 */
export default function ShareLinkCard({ slug, businessName, celebrationKind }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [previewBust, setPreviewBust] = useState(() => Date.now());
  const rootRef = useRef(null);

  // V16.1 — auto-scroll when we're rendered as a post-payment / post-verify
  // celebration so the share UI is in the viewport without the user having
  // to scroll to find it.
  useEffect(() => {
    if (celebrationKind && rootRef.current) {
      const t = setTimeout(() => {
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [celebrationKind]);

  if (!slug) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const backend = process.env.REACT_APP_BACKEND_URL || origin;
  // Friendly short alias + ?ref so referred views can be credited
  const refParam = `?ref=${encodeURIComponent(slug)}`;
  // Section 56 — share-ready URL points at our OG endpoint (rich social previews
  // for WhatsApp / Facebook / Twitter / iMessage) which auto-redirects humans
  // to /p/{slug} via meta-refresh + window.location.replace.
  const shortUrl = `${backend}/api/og/p/${slug}${refParam}`;
  // Canonical SEO URL (kept clean for the "Ver mi eCard" preview)
  const fullUrl = `${origin}/p/${slug}`;
  const displayUrl = shortUrl.replace(/^https?:\/\//, "").replace(refParam, "").replace("/api/og/p/", "/p/");
  // V16 image endpoints
  const previewImg = `${backend}/api/og-image/${slug}.png?t=${previewBust}`;
  const storyImg = `${backend}/api/og-image/story/${slug}.png?t=${previewBust}`;

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

  // Section 50 — Multi-channel eCard sharing: Facebook, X/Twitter, SMS, Instagram
  const shareFacebook = () => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shortUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(fbUrl, "_blank", "width=600,height=500");
    _trackShare("facebook");
  };

  const shareTwitter = () => {
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(xUrl, "_blank", "width=600,height=500");
    _trackShare("x");
  };

  const shareSMS = () => {
    // Universal sms: link; iOS uses sms:&body=, Android uses sms:?body=
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const sep = isIOS ? "&" : "?";
    window.location.href = `sms:${sep}body=${encodeURIComponent(shareText)}`;
    _trackShare("sms");
  };

  const shareInstagram = async () => {
    // Instagram no permite share por URL directo · copiamos texto+link y abrimos la app
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("Texto copiado. Pégalo en tu historia o bio de Instagram.");
      _trackShare("instagram");
      // Si está en móvil intentamos abrir la app
      const isMobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
      if (isMobile) {
        setTimeout(() => { window.location.href = "instagram://camera"; }, 600);
      }
    } catch {
      toast.error("No se pudo copiar — intenta de nuevo");
    }
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

  // V16 / V16.1 — Publish the 1080×1920 story PNG directly into IG/FB/WhatsApp
  // Stories via the Web Share API with file payload (mobile). On desktop or
  // browsers that don't support file sharing we fall back to a plain download
  // with clear copy telling the user to upload from their phone.
  const publishStory = async () => {
    const id = toast.loading("Preparando imagen para tu historia…");
    try {
      const r = await fetch(storyImg);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const file = new File([blob], `${slug}-story.png`, { type: "image/png" });

      // Web Share API with files — opens the native share sheet which
      // includes Instagram → Story, Facebook → Story, WhatsApp Status, etc.
      // The image is preloaded into the target app's composer.
      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: businessName,
            text: shareText,
          });
          _trackShare("story_publish");
          toast.success("¡Listo! Elige Instagram, Facebook o WhatsApp Story.", { id });
          return;
        } catch (e) {
          if (e?.name === "AbortError") {
            toast.dismiss(id);
            return; // user cancelled — leave silently
          }
          // Any other error → fall through to download fallback below
          console.error("native story share failed", e);
        }
      }

      // Desktop / unsupported fallback: regular download + helpful copy.
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = `${slug}-story.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      _trackShare("story_download");
      toast.success(
        "Imagen descargada. Súbela como historia desde tu celular para mejor calidad.",
        { id, duration: 6000 },
      );
    } catch (e) {
      console.error("publish story failed", e);
      toast.error("No se pudo preparar la imagen", { id });
    }
  };

  const validateFB = () => {
    // Facebook Sharing Debugger pre-fills the URL so the provider can see
    // exactly what FB will show when someone pastes the link.
    const url = `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(shortUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const validateX = () => {
    // Twitter (now X) deprecated their validator but the cards.dev mirror still
    // works for many; we open the URL via their internal redirect as fallback.
    const url = `https://cards-dev.twitter.com/validator?url=${encodeURIComponent(shortUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const refreshPreview = () => {
    setPreviewBust(Date.now());
    toast.success("Previa actualizada");
  };

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-6"
      style={{
        background: "linear-gradient(135deg, #03045E 0%, #0A4D5E 60%, #03045E 100%)",
        boxShadow: "0 12px 40px -16px rgba(11,15,46,0.6)",
      }}
      data-testid="share-link-card"
    >
      {/* Decorative gradient blob */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

      {/* V16.1 — Celebration banner shown after a successful payment or
          verification activation. Disappears once the URL ?celebrate=...
          param is consumed by the dashboard. */}
      {celebrationKind && (
        <div
          className="relative mb-4 rounded-2xl border border-amber-300/40 bg-gradient-to-r from-amber-400/20 via-orange-500/15 to-rose-500/20 px-4 py-3 flex items-start gap-3 animate-fadeSlideUp"
          data-testid="share-link-celebration-banner"
          data-celebration-kind={celebrationKind}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shadow-lg">
            {celebrationKind === "verified"
              ? <Sparkles className="w-5 h-5 text-white" />
              : <PartyPopper className="w-5 h-5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-display font-bold text-base leading-tight">
              {celebrationKind === "verified"
                ? "¡Estás verificado! 🎉"
                : "¡Tu nueva eCard está lista! 🎉"}
            </p>
            <p className="text-white/80 text-xs mt-0.5 leading-snug">
              {celebrationKind === "verified"
                ? "Comparte tu eCard ahora — la insignia verde te abre más confianza con tu próximo cliente."
                : "Compártela con tu primer cliente. Mientras más rápido la conozca tu red, más rápido llegan los pedidos."}
            </p>
          </div>
        </div>
      )}

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

      {/* V16 — Live social preview */}
      <div className="relative mb-4 rounded-2xl overflow-hidden bg-black/30 border border-white/10" data-testid="share-link-social-preview">
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/40 border-b border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] text-white/85 font-semibold tracking-wide">
            <ImageIcon className="w-3.5 h-3.5 text-orange-300" />
            Así se verá en Facebook / WhatsApp / X
          </div>
          <button
            type="button"
            onClick={refreshPreview}
            className="text-[10px] text-white/60 hover:text-white px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 transition"
            data-testid="share-link-preview-refresh"
          >
            Actualizar
          </button>
        </div>
        <img
          src={previewImg}
          alt={`Vista previa para compartir · ${businessName}`}
          className="block w-full h-auto"
          loading="lazy"
          data-testid="share-link-preview-img"
        />
        <div className="px-3 py-2 text-[10px] text-white/55 leading-snug">
          La imagen usa tu primera foto de galería automáticamente. Cuando agregues más fotos, esta vista previa se actualiza.
        </div>
      </div>

      {/* URL display + copy */}
      <button onClick={copy}
        className="relative w-full flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/95 hover:bg-white text-left transition group"
        data-testid="share-link-copy-btn">
        <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center p-0.5" style={{ backgroundColor: "#EBF8F7" }}>
          <BrandMark size="md" className="w-full h-full" alt="" />
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
        <button onClick={shareSMS} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-sms">
          <MessageSquare className="w-4 h-4 text-emerald-300" />
          <span className="text-[11px]">SMS</span>
        </button>
        <button onClick={shareEmail} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-email">
          <Mail className="w-4 h-4 text-blue-300" />
          <span className="text-[11px]">Email</span>
        </button>
        <button onClick={shareFacebook} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-facebook">
          <Facebook className="w-4 h-4 text-blue-400" />
          <span className="text-[11px]">Facebook</span>
        </button>
        <button onClick={shareTwitter} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-x">
          <Twitter className="w-4 h-4 text-sky-300" />
          <span className="text-[11px]">X</span>
        </button>
        <button onClick={shareInstagram} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-instagram">
          <Instagram className="w-4 h-4 text-pink-300" />
          <span className="text-[11px]">Instagram</span>
        </button>
        <button onClick={() => setShowQr(true)} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-qr">
          <QrCode className="w-4 h-4 text-orange-300" />
          <span className="text-[11px]">Código QR</span>
        </button>
        <button onClick={nativeShare} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white transition" data-testid="share-link-native">
          <Smartphone className="w-4 h-4 text-purple-300" />
          <span className="text-[11px]">Más...</span>
        </button>
      </div>

      {/* V16 — Publish to Story + validators */}
      <div className="relative mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        <button
          onClick={publishStory}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 hover:from-pink-600 hover:via-fuchsia-600 hover:to-purple-600 text-white text-sm font-semibold shadow-lg transition"
          data-testid="share-link-story-publish"
        >
          <Instagram className="w-4 h-4" />
          Publicar en Story
        </button>
        <button
          onClick={validateFB}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white text-sm font-medium transition"
          data-testid="share-link-validate-fb"
        >
          <Search className="w-4 h-4 text-blue-300" />
          Validar en Facebook
        </button>
        <button
          onClick={validateX}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur text-white text-sm font-medium transition"
          data-testid="share-link-validate-x"
        >
          <Search className="w-4 h-4 text-sky-300" />
          Validar en X
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
            <Link
              to="/dashboard/print-card"
              onClick={() => setShowQr(false)}
              className="mt-2 w-full py-3 rounded-full border border-teal-700 text-teal-700 hover:bg-teal-50 text-sm font-semibold flex items-center justify-center gap-2"
              data-testid="qr-modal-print-card"
            >
              <Printer className="w-4 h-4" /> Imprimir tarjetas físicas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
