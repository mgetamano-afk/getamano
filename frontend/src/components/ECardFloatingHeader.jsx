import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

/**
 * ECardFloatingHeader — Section 32.
 * Sticky top bar that stays visible on the public eCard with three actions:
 *   ← Back   |   ❤ Like (server-backed via LikeButton API)   |   ↗ Share (Web Share API + clipboard fallback)
 *
 * Light theme; matches getamano Alabaster + teal palette. On scroll, the
 * background gets a frosted-glass effect.
 */
export default function ECardFloatingHeader({ provider, lang = "es" }) {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(provider?.likes_count || 0);
  const [busy, setBusy] = useState(false);

  // Read persisted like state for this slug (matches LikeButton convention)
  useState(() => {
    if (typeof window === "undefined") return;
    const persisted = localStorage.getItem(`liked_${provider?.slug}`);
    if (persisted === "true") setLiked(true);
  }, [provider?.slug]);

  const toggleLike = async () => {
    if (!provider?.provider_id || busy) return;
    setBusy(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikes((c) => Math.max(0, c + (newLiked ? 1 : -1)));
    try {
      // Backend already has /providers/{id}/like endpoint used by LikeButton
      await api.post(`/providers/${provider.provider_id}/like`, { liked: newLiked });
      try { localStorage.setItem(`liked_${provider.slug}`, String(newLiked)); } catch (_e) { /* localStorage unavailable */ }
    } catch (_e) {
      // revert on failure
      setLiked(!newLiked);
      setLikes((c) => Math.max(0, c + (newLiked ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/services/${provider?.slug}`;
    const title = lang === "en" ? `${provider?.business_name} on getamano` : `${provider?.business_name} en getamano`;
    const text = lang === "en"
      ? `Check out ${provider?.business_name} on getamano — the Latino services marketplace`
      : `Mira el perfil de ${provider?.business_name} en getamano — el marketplace de servicios latinos`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // user cancelled
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(lang === "en" ? "Link copied!" : "¡Enlace copiado!");
    } catch (_e) {
      toast.error(lang === "en" ? "Could not copy link" : "No se pudo copiar el enlace");
    }
  };

  return (
    <div
      className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 mb-4 flex items-center justify-between bg-white/85 backdrop-blur-md border-b border-slate-100"
      data-testid="ecard-floating-header"
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-teal-700 transition px-2 py-1 rounded-lg active:bg-slate-100"
        data-testid="ecard-fh-back"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">{lang === "en" ? "Back" : "Regresar"}</span>
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
            liked
              ? "bg-rose-50 border-rose-200 text-rose-600"
              : "bg-white border-slate-200 text-slate-600 hover:border-rose-200 hover:text-rose-500"
          }`}
          data-testid="ecard-fh-like"
        >
          <Heart className={`w-4 h-4 transition-transform ${liked ? "fill-rose-500 text-rose-500 scale-110" : ""}`} />
          <span>{likes > 0 ? likes : (lang === "en" ? "Like" : "Me gusta")}</span>
        </button>

        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-700 transition"
          data-testid="ecard-fh-share"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">{lang === "en" ? "Share" : "Compartir"}</span>
        </button>
      </div>
    </div>
  );
}
