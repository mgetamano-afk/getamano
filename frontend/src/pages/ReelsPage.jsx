import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart, Share2, ChevronLeft, Volume2, VolumeX, Loader2,
  ShieldCheck, MapPin, Eye, Play, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { sharePayload } from "../lib/shareUtils";
import { buildFileUrl } from "../components/ImageUpload";
import { resolveAvatar } from "../lib/avatar";
import ReelCreator from "../components/ReelCreator";
import VerifiedBadge from "../components/VerifiedBadge";

/**
 * ReelsPage — Section 89 v4 Phase E.
 *
 * Vertical full-screen feed of short-form provider videos (TikTok / IG
 * Reels pattern). Uses `scroll-snap-y mandatory` for smooth swipe
 * navigation and an `IntersectionObserver` to autoplay only the active
 * reel and pause every other.
 *
 * Each reel slide shows:
 *  · the video (loop, playsInline, click-to-toggle play/pause)
 *  · right-side action rail: like, comment-count (read-only for now),
 *    share, view profile
 *  · author overlay with avatar + business name + GM-XXXX + caption
 *
 * The "Create" floating button opens a modal that uploads a video file
 * via `/api/upload` (handles big files via the existing chunked path)
 * then creates the reel via `/api/reels`.
 */

export default function ReelsPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusReelId = searchParams.get("r") || null;

  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const containerRef = useRef(null);
  const slideRefs = useRef({});
  const videoRefs = useRef({});
  const viewedRef = useRef(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/reels", { params: { limit: 25 } });
      const items = r.data || [];
      // If a specific reel was requested via ?r=, place it first.
      if (focusReelId) {
        const idx = items.findIndex(x => x.reel_id === focusReelId);
        if (idx > 0) items.unshift(items.splice(idx, 1)[0]);
      }
      setReels(items);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setLoading(false); }
  }, [focusReelId]);

  useEffect(() => { load(); }, [load]);

  // Observe which slide is active to autoplay only that video.
  useEffect(() => {
    if (!reels.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const idx = Number(entry.target.dataset.idx);
        const video = videoRefs.current[idx];
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          setActiveIdx(idx);
          video.play().catch(() => {});
          // Track view (24h-deduped server side; we also dedupe locally).
          const reel = reels[idx];
          if (reel && user && !viewedRef.current.has(reel.reel_id)) {
            viewedRef.current.add(reel.reel_id);
            api.post(`/reels/${reel.reel_id}/view`).catch(() => {});
          }
        } else {
          video.pause();
        }
      });
    }, { threshold: [0.6] });
    Object.values(slideRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [reels, user]);

  // Mute toggle propagates to every video element.
  useEffect(() => {
    Object.values(videoRefs.current).forEach((v) => { if (v) v.muted = muted; });
  }, [muted]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-30 bg-black overflow-y-scroll snap-y snap-mandatory"
      style={{ scrollSnapType: "y mandatory" }}
      data-testid="reels-page"
    >
      {/* Top-left back button */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="fixed top-3 left-3 z-50 w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 active:scale-95"
        data-testid="reels-back"
        aria-label={lang === "en" ? "Back" : "Volver"}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* Top-right mute toggle */}
      <button
        type="button"
        onClick={() => setMuted(m => !m)}
        className="fixed top-3 right-3 z-50 w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 active:scale-95"
        data-testid="reels-mute"
        aria-label={muted ? (lang === "en" ? "Unmute" : "Activar sonido") : (lang === "en" ? "Mute" : "Silenciar")}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Floating "Create reel" — providers only */}
      {user && (
        <button
          type="button"
          onClick={() => setCreatorOpen(true)}
          className="fixed bottom-6 right-4 z-50 w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-2xl active:scale-95"
          data-testid="reels-create"
          aria-label={lang === "en" ? "Create reel" : "Crear reel"}
        >
          <Plus className="w-6 h-6" strokeWidth={3} />
        </button>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}

      {!loading && !reels.length && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6 text-center" data-testid="reels-empty">
          <Play className="w-12 h-12 mb-3 opacity-70" />
          <h2 className="font-display font-bold text-xl mb-1 text-white">
            {lang === "en" ? "No reels yet" : "Aún no hay reels"}
          </h2>
          <p className="text-sm text-white/70 max-w-xs">
            {lang === "en"
              ? "Providers can post 60-second vertical videos. Tap + to be the first."
              : "Los proveedores pueden subir videos verticales de 60s. Toca + para ser el primero."}
          </p>
        </div>
      )}

      {reels.map((reel, idx) => (
        <ReelSlide
          key={reel.reel_id}
          reel={reel}
          idx={idx}
          isActive={idx === activeIdx}
          muted={muted}
          slideRef={(el) => { slideRefs.current[idx] = el; }}
          videoRef={(el) => { videoRefs.current[idx] = el; }}
          lang={lang}
          onLikeChange={(liked, delta) => {
            setReels(prev => prev.map((r, i) => i === idx
              ? { ...r, likes_count: Math.max(0, (r.likes_count || 0) + delta), _liked: liked }
              : r));
          }}
        />
      ))}

      {creatorOpen && (
        <ReelCreator
          onClose={() => setCreatorOpen(false)}
          onCreated={() => { setCreatorOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Single slide ─────────────────────────────────────────────────────
function ReelSlide({ reel, idx, isActive, muted, slideRef, videoRef, lang, onLikeChange }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!reel._liked);
  const [likes, setLikes] = useState(reel.likes_count || 0);
  const [pending, setPending] = useState(false);
  const localVideoRef = useRef(null);

  const onLike = async () => {
    if (pending) return;
    if (!user) { toast.message(lang === "en" ? "Sign in to like" : "Inicia sesión para dar like"); return; }
    setPending(true);
    const next = !liked;
    setLiked(next); setLikes(n => n + (next ? 1 : -1));
    onLikeChange(next, next ? 1 : -1);
    try {
      const r = await api.post(`/reels/${reel.reel_id}/like`);
      setLiked(!!r.data?.liked);
    } catch {
      setLiked(liked); setLikes(reel.likes_count || 0);
    } finally { setPending(false); }
  };

  const onShare = async () => {
    await sharePayload({
      title: reel.business_name || "getamano",
      text: reel.caption || "",
      url: `${window.location.origin}/reels?r=${reel.reel_id}`,
    });
  };

  const onTapVideo = () => {
    const v = localVideoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <section
      ref={slideRef}
      data-idx={idx}
      className="relative h-[100dvh] w-full snap-start flex items-center justify-center"
      data-testid={`reel-slide-${reel.reel_id}`}
    >
      <video
        ref={(el) => { localVideoRef.current = el; videoRef(el); }}
        src={buildFileUrl(reel.video_url)}
        poster={reel.thumbnail_url ? buildFileUrl(reel.thumbnail_url) : undefined}
        className="w-full h-full object-cover"
        loop
        playsInline
        muted={muted}
        onClick={onTapVideo}
        data-testid={`reel-video-${reel.reel_id}`}
      />
      {/* Bottom gradient + caption */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pb-6 pointer-events-none">
        <div className="flex items-end gap-3 max-w-md pointer-events-auto">
          <Link
            to={reel.provider_slug ? `/p/${reel.provider_slug}` : "#"}
            className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white flex-shrink-0"
          >
            <img
              src={resolveAvatar(reel.logo_url, reel.business_name)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </Link>
          <div className="flex-1 min-w-0 text-white">
            <p className="font-bold text-sm inline-flex items-center gap-1">
              {reel.business_name}
              {reel.verified && <VerifiedBadge size={14} />}
            </p>
            <p className="text-[11px] text-white/70 inline-flex items-center gap-1.5">
              {reel.getamano_code && <span className="font-mono">{reel.getamano_code}</span>}
              {reel.city && (
                <span className="inline-flex items-center gap-0.5">
                  · <MapPin className="w-2.5 h-2.5" /> {reel.city}
                </span>
              )}
            </p>
            {reel.caption && (
              <p className="text-sm mt-1.5 leading-snug whitespace-pre-wrap break-words line-clamp-3" data-testid={`reel-caption-${reel.reel_id}`}>
                {reel.caption}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right-side action rail */}
      <aside className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={onLike}
          disabled={pending}
          className={`flex flex-col items-center gap-0.5 transition ${liked ? "text-rose-500" : "text-white"}`}
          data-testid={`reel-like-${reel.reel_id}`}
        >
          <Heart className={`w-9 h-9 drop-shadow-lg ${liked ? "fill-current" : ""}`} />
          <span className="text-xs font-bold drop-shadow">{likes}</span>
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex flex-col items-center gap-0.5 text-white"
          data-testid={`reel-share-${reel.reel_id}`}
        >
          <Share2 className="w-9 h-9 drop-shadow-lg" />
        </button>
        {reel.provider_slug && (
          <Link
            to={`/p/${reel.provider_slug}`}
            className="flex flex-col items-center gap-0.5 text-white"
            data-testid={`reel-profile-${reel.reel_id}`}
          >
            <Eye className="w-9 h-9 drop-shadow-lg" />
            <span className="text-[10px] font-bold drop-shadow">
              {lang === "en" ? "Profile" : "Perfil"}
            </span>
          </Link>
        )}
      </aside>

      {/* Pause indicator (shown when video is paused via tap) */}
      <PausedIndicator videoRef={localVideoRef} />
    </section>
  );
}

function PausedIndicator({ videoRef }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const on = () => setPaused(true);
    const off = () => setPaused(false);
    v.addEventListener("pause", on);
    v.addEventListener("play", off);
    return () => { v.removeEventListener("pause", on); v.removeEventListener("play", off); };
  }, [videoRef]);
  if (!paused) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
        <Play className="w-8 h-8 text-white" fill="currentColor" />
      </div>
    </div>
  );
}
