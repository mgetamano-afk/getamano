/**
 * ReelActionMenu — V15 contextual FAB for /reels.
 *
 * Replaces the global QuickActionsFAB while on /reels. Renders a single
 * round "+" button bottom-right. Tap → fan-out of 5 round action chips:
 *
 *   1. Subir Reel       → opens <ReelCreator>
 *   2. Grabar Reel      → opens <ReelCameraRecorder> (MediaRecorder API)
 *   3. Compartir Reel   → Web Share API + share count tracking
 *   4. Me gusta este reel → heart emoji + scale burst
 *   5. Guardar reel     → POST /reels/{id}/save + bookmark animation
 *
 * Owner of the current reel + their verified badge live ON the reel
 * itself (see ReelsPage). This menu only handles ACTIONS.
 *
 * The "Impresionante" reaction (Nota 1: emoji wow) is rendered as a
 * 6th action on long-press OR via the explicit wow button on the reel
 * surface. We use a sparkle-burst animation when fired.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  Plus, X, Upload, Video, Share2, Heart, Bookmark, Sparkles, Loader2,
} from "lucide-react";
import ReelCameraRecorder from "./ReelCameraRecorder";

export default function ReelActionMenu({ activeReel, onAfterUpload, onAfterRecord }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [reactions, setReactions] = useState({ liked: false, wowed: false, saved: false });
  const [burst, setBurst] = useState(null); // "like" | "wow" | null
  const wrapperRef = useRef(null);

  // Close on outside-click / Esc. We wait one tick before attaching the
  // listener so the click that OPENED the menu doesn't immediately close
  // it via bubble to window.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Hydrate "did I already react?" state when the active reel changes.
  useEffect(() => {
    if (!activeReel?.reel_id || !user) { setReactions({ liked: false, wowed: false, saved: false }); return; }
    let alive = true;
    api.get(`/reels/${activeReel.reel_id}/reactions/me`).then(r => {
      if (alive) setReactions(r.data || {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeReel?.reel_id, user]);

  if (!user) return null;

  const requireReel = () => {
    if (!activeReel?.reel_id) {
      toast.info("Desliza a un reel primero");
      return false;
    }
    return true;
  };

  const onUploadClick = () => {
    setOpen(false);
    // Trigger the parent's reel-creator modal via a custom event so we
    // don't have to pass refs all the way up.
    window.dispatchEvent(new CustomEvent("reels:open-creator"));
  };

  const onRecordClick = () => {
    setOpen(false);
    setRecorderOpen(true);
  };

  const onShareClick = async () => {
    setOpen(false);
    if (!requireReel()) return;
    setBusy("share");
    const url = `${window.location.origin}/reels?r=${activeReel.reel_id}`;
    const shareText = `Mira este reel en getamano${activeReel.business_name ? ` — ${activeReel.business_name}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "getamano", text: shareText, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado");
      }
      await api.post(`/reels/${activeReel.reel_id}/share`).catch(() => {});
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("No se pudo compartir");
    } finally {
      setBusy(null);
    }
  };

  const onLikeClick = async () => {
    if (!requireReel()) return;
    setOpen(false);
    setBusy("like");
    try {
      const r = await api.post(`/reels/${activeReel.reel_id}/like`);
      const liked = !!r.data?.liked;
      setReactions(prev => ({ ...prev, liked }));
      if (liked) {
        setBurst("like");
        setTimeout(() => setBurst(null), 900);
      }
    } catch {
      toast.error("Error");
    } finally {
      setBusy(null);
    }
  };

  const onWowClick = async () => {
    if (!requireReel()) return;
    setOpen(false);
    setBusy("wow");
    try {
      const r = await api.post(`/reels/${activeReel.reel_id}/wow`);
      const wowed = !!r.data?.wowed;
      setReactions(prev => ({ ...prev, wowed }));
      if (wowed) {
        setBurst("wow");
        setTimeout(() => setBurst(null), 1100);
      }
    } catch {
      toast.error("Error");
    } finally {
      setBusy(null);
    }
  };

  const onSaveClick = async () => {
    if (!requireReel()) return;
    setOpen(false);
    setBusy("save");
    try {
      const r = await api.post(`/reels/${activeReel.reel_id}/save`);
      const saved = !!r.data?.saved;
      setReactions(prev => ({ ...prev, saved }));
      toast.success(saved ? "Reel guardado" : "Quitado de guardados");
    } catch {
      toast.error("Error");
    } finally {
      setBusy(null);
    }
  };

  const ACTIONS = [
    { id: "wow",    Icon: Sparkles, label: "Impresionante", onClick: onWowClick,
      colorClass: "from-amber-400 to-rose-500", active: reactions.wowed },
    { id: "like",   Icon: Heart,    label: "Me gusta",      onClick: onLikeClick,
      colorClass: "from-rose-500 to-pink-500",  active: reactions.liked },
    { id: "save",   Icon: Bookmark, label: "Guardar",       onClick: onSaveClick,
      colorClass: "from-blue-500 to-indigo-500", active: reactions.saved },
    { id: "share",  Icon: Share2,   label: "Compartir",     onClick: onShareClick,
      colorClass: "from-emerald-500 to-teal-500" },
    { id: "record", Icon: Video,    label: "Grabar Reel",   onClick: onRecordClick,
      colorClass: "from-violet-500 to-fuchsia-600" },
    { id: "upload", Icon: Upload,   label: "Subir Reel",    onClick: onUploadClick,
      colorClass: "from-slate-700 to-slate-900" },
  ];

  return (
    <>
      <div
        ref={wrapperRef}
        className="fixed right-4 sm:right-6 z-50 flex flex-col items-end gap-3"
        style={{ bottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}
        data-testid="reel-action-menu"
      >
        {/* Action chips fan out vertically above the FAB. V15.2 — only
            the colored icon circle is shown (text labels removed per
            founder feedback: "que queden sueltos sobre el reel"). The
            label still lives in `aria-label` + native tooltip for a11y. */}
        {open && (
          <div className="flex flex-col items-end gap-2.5 mb-1">
            {ACTIONS.map((a, i) => {
              const Icon = a.Icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={a.onClick}
                  disabled={busy === a.id}
                  title={a.label}
                  aria-label={a.label}
                  className="reel-action-chip active:scale-95 transition will-change-transform"
                  style={{ animationDelay: `${i * 35}ms` }}
                  data-testid={`reel-action-${a.id}`}
                >
                  <span className={`w-12 h-12 rounded-full bg-gradient-to-br ${a.colorClass} text-white flex items-center justify-center shadow-lg hover:scale-110 transition ${a.active ? "ring-2 ring-white/70" : ""}`}>
                    {busy === a.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" strokeWidth={2.5} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main "+" toggle */}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 ${
            open
              ? "bg-white text-slate-900 rotate-45"
              : "bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white hover:scale-105"
          }`}
          aria-label={open ? "Cerrar menú" : "Abrir menú de acciones"}
          data-testid="reel-action-fab"
        >
          {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" strokeWidth={2.5} />}
        </button>
      </div>

      {/* Reaction burst overlays — fullscreen, pointer-events-none */}
      {burst === "like" && <LikeBurst />}
      {burst === "wow" && <WowBurst />}

      {/* Camera recorder modal */}
      {recorderOpen && (
        <ReelCameraRecorder
          onClose={() => setRecorderOpen(false)}
          onUploaded={(reel) => {
            setRecorderOpen(false);
            onAfterRecord?.(reel);
          }}
        />
      )}

      {/* Local animations */}
      <style>{`
        .reel-action-chip { animation: chipIn 280ms cubic-bezier(0.21, 0.8, 0.3, 1.1) both; }
        @keyframes chipIn {
          from { opacity: 0; transform: translateY(12px) scale(0.85); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

// ── Burst overlays (exported so ReelsPage can reuse LikeBurst on
// the double-tap gesture) ──────────────────────────────────────────

export function LikeBurst() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" data-testid="like-burst">
      <div className="relative">
        <span className="block text-[140px] like-burst-heart">❤️</span>
        {[...Array(6)].map((_, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 text-2xl like-burst-pop"
            style={{ animationDelay: `${i * 60}ms`, ["--angle"]: `${(360 / 6) * i}deg` }}
          >❤️</span>
        ))}
      </div>
      <style>{`
        @keyframes likeMain {
          0%   { transform: scale(0.3); opacity: 0; }
          50%  { transform: scale(1.4); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        .like-burst-heart {
          animation: likeMain 850ms cubic-bezier(0.32, 0.72, 0.4, 1.4) both;
          filter: drop-shadow(0 6px 32px rgba(244, 63, 94, 0.6));
        }
        @keyframes likePop {
          0%   { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-180px); opacity: 0; }
        }
        .like-burst-pop {
          animation: likePop 800ms ease-out both;
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
}

function WowBurst() {
  // 12 sparkle particles + central "✨" + radial glow
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" data-testid="wow-burst">
      <div className="relative">
        <div className="absolute inset-0 w-[260px] h-[260px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full wow-glow" />
        <span className="block text-[120px] wow-burst-main">✨</span>
        {[...Array(12)].map((_, i) => {
          const angle = (360 / 12) * i;
          const emoji = ["⭐", "💫", "✨", "🌟"][i % 4];
          return (
            <span
              key={i}
              className="absolute top-1/2 left-1/2 text-3xl wow-burst-particle"
              style={{ animationDelay: `${i * 40}ms`, ["--angle"]: `${angle}deg` }}
            >{emoji}</span>
          );
        })}
      </div>
      <style>{`
        @keyframes wowMain {
          0%   { transform: scale(0.2) rotate(-20deg); opacity: 0; }
          40%  { transform: scale(1.6) rotate(8deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(0deg); opacity: 0; }
        }
        .wow-burst-main {
          animation: wowMain 1050ms cubic-bezier(0.32, 0.72, 0.4, 1.4) both;
          filter: drop-shadow(0 8px 36px rgba(252, 211, 77, 0.65));
        }
        @keyframes wowParticle {
          0%   { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0)    scale(0.6); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-240px) scale(0.2); opacity: 0; }
        }
        .wow-burst-particle {
          animation: wowParticle 1100ms cubic-bezier(0.16, 0.6, 0.32, 1.2) both;
          will-change: transform, opacity;
        }
        @keyframes wowGlow {
          0%   { transform: scale(0.4); opacity: 0; background: radial-gradient(closest-side, rgba(252,211,77,0.0), transparent); }
          40%  { transform: scale(1); opacity: 1; background: radial-gradient(closest-side, rgba(252,211,77,0.65), transparent); }
          100% { transform: scale(1.4); opacity: 0; background: radial-gradient(closest-side, rgba(252,211,77,0.0), transparent); }
        }
        .wow-glow { animation: wowGlow 1100ms ease-out both; }
      `}</style>
    </div>
  );
}
