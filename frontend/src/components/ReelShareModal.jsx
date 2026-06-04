import { useState } from "react";
import { Facebook, Twitter, MessageCircle, Instagram, Music2, Copy, Check, X, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

/**
 * ReelShareModal — V18.6 native-feeling external share for reels.
 *
 * When a reel is shared via this modal, the link points at our
 * `/api/og/reel/{reel_id}` endpoint. Crawlers (FB, X, IG, WhatsApp,
 * iMessage) get rich OG meta tags with the reel thumbnail as the
 * preview image; humans get a meta-refresh redirect to /reels?r=ID
 * inside 100ms.
 *
 * Supported targets:
 *   - Facebook (sharer.php — opens FB composer with link pre-filled)
 *   - X / Twitter (twitter.com/intent/tweet — caption + link)
 *   - WhatsApp (wa.me/?text= — caption + link)
 *   - Instagram (NO web share API — we copy caption+link to clipboard
 *     and open instagram:// scheme on mobile; on desktop we just toast
 *     "Texto copiado, abrí Instagram y pega").
 *   - TikTok (same constraint as IG — clipboard + deep link).
 *   - Native share sheet (Web Share API) — preferred on iOS / Android
 *     because it shows ALL installed apps including the user's
 *     preferred messaging app.
 *   - Copy link
 *
 * Props:
 *   open: bool · onClose: fn · reel: { reel_id, caption, business_name, thumbnail_url }
 */
export default function ReelShareModal({ open, onClose, reel }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open || !reel?.reel_id) return null;

  const backend = process.env.REACT_APP_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "");
  // Share URL goes through our OG endpoint so crawlers see rich previews.
  const shareUrl = `${backend}/api/og/reel/${reel.reel_id}`;
  const business = reel.business_name || "este negocio latino";
  const caption = (reel.caption || "").trim() || `Mira este reel de ${business} en getamano`;
  const shareText = `${caption}\n\n💚 En getamano - Lo latino, a la mano.`;

  const open_window = (url, name = "share") => {
    const w = 600, h = 580;
    const left = window.screen.width / 2 - w / 2;
    const top = window.screen.height / 2 - h / 2;
    window.open(url, name, `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
  };

  const shareToFacebook = () => {
    // Facebook strips the `quote` param if the URL has its own OG tags
    // (Graph API returns 400). We just send the URL — FB's own scraper
    // fetches our /api/og/reel/{id} and renders the rich preview.
    open_window(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "fb-share");
    toast.success("Abriendo Facebook…");
  };

  const shareToTwitter = () => {
    const text = `${caption} 🎬`;
    open_window(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, "x-share");
    toast.success("Abriendo X…");
  };

  const shareToWhatsApp = () => {
    const text = `${shareText}\n\n${shareUrl}`;
    // wa.me works on both mobile (opens app) and desktop (web.whatsapp).
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    toast.success("Abriendo WhatsApp…");
  };

  const shareToInstagram = async () => {
    // Instagram has no public web share endpoint. The closest "native"
    // feel is: copy the caption + URL, then open the IG app via deep
    // link so the user just pastes into a DM or story.
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      toast.success("Texto copiado. Abre Instagram y pega en tu DM o historia.");
      if (/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        setTimeout(() => { window.location.href = "instagram://camera"; }, 400);
      }
    } catch {
      toast.error("No se pudo copiar — intenta otro método");
    }
  };

  const shareToTikTok = async () => {
    // Same constraint as IG — TikTok's official web share kit needs a
    // verified Business Account. Clipboard + deep link is the universal
    // path for now.
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      toast.success("Texto copiado. Abre TikTok y pega.");
      if (/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        setTimeout(() => { window.location.href = "snssdk1233://"; }, 400);
      }
    } catch {
      toast.error("No se pudo copiar — intenta otro método");
    }
  };

  const shareNative = async () => {
    setBusy(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: business, text: shareText, url: shareUrl });
        toast.success("¡Compartido!");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Enlace copiado");
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error("share failed", e);
        toast.error("No se pudo compartir");
      }
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  // Visual config for the 6 main targets. Brand colors match each
  // platform's own (FB blue, X black, WA green, IG gradient, TT gradient,
  // native iOS-style charcoal).
  const TARGETS = [
    { id: "facebook",  Icon: Facebook,      label: "Facebook",  onClick: shareToFacebook,
      style: "bg-[#1877F2] hover:bg-[#1465D1]" },
    { id: "twitter",   Icon: Twitter,       label: "X",         onClick: shareToTwitter,
      style: "bg-black hover:bg-slate-800" },
    { id: "whatsapp",  Icon: MessageCircle, label: "WhatsApp",  onClick: shareToWhatsApp,
      style: "bg-[#25D366] hover:bg-[#1FB559]" },
    { id: "instagram", Icon: Instagram,     label: "Instagram", onClick: shareToInstagram,
      style: "bg-gradient-to-br from-[#FEDA75] via-[#FA7E1E] to-[#D62976] hover:opacity-90" },
    { id: "tiktok",    Icon: Music2,        label: "TikTok",    onClick: shareToTikTok,
      style: "bg-gradient-to-br from-[#FF0050] to-[#00F2EA] hover:opacity-90" },
    { id: "more",      Icon: LinkIcon,      label: "Más opciones", onClick: shareNative,
      style: "bg-slate-700 hover:bg-slate-600" },
  ];

  return (
    <div
      className="fixed inset-0 z-[180] bg-black/70 backdrop-blur-md flex items-end md:items-center justify-center md:p-4"
      data-testid="reel-share-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
        {/* Drag handle */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-slate-900 text-base">Compartir reel</h3>
            <p className="text-xs text-slate-500 truncate">{business}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full" data-testid="reel-share-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Thumbnail preview so user sees what they're sharing */}
        {reel.thumbnail_url && (
          <div className="px-5 pt-4">
            <div className="rounded-2xl overflow-hidden bg-slate-100 aspect-video relative">
              <img src={reel.thumbnail_url} alt="Reel" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 text-white text-xs font-medium line-clamp-2">
                {caption}
              </div>
            </div>
          </div>
        )}

        {/* 6-button platform grid */}
        <div className="grid grid-cols-3 gap-3 p-5">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={t.onClick}
              disabled={busy}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl text-white font-medium transition active:scale-95 disabled:opacity-50 ${t.style}`}
              data-testid={`reel-share-${t.id}`}
            >
              <t.Icon className="w-6 h-6" strokeWidth={2.2} />
              <span className="text-[11px]">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Copy link row */}
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={copyLink}
            className="w-full py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm inline-flex items-center justify-center gap-2 transition"
            data-testid="reel-share-copy"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? "¡Copiado!" : "Copiar enlace"}
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            El enlace muestra una vista previa nativa con el thumbnail del reel y la marca getamano.
          </p>
        </div>
      </div>
    </div>
  );
}
