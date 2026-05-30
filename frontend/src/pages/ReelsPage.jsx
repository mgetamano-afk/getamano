import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart, ChevronLeft, Volume2, VolumeX, Loader2,
  ShieldCheck, MapPin, Eye, Play, Sparkles, Bookmark, Share2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { buildFileUrl } from "../components/ImageUpload";
import { resolveAvatar } from "../lib/avatar";
import ReelCreator from "../components/ReelCreator";
import VerifiedBadge from "../components/VerifiedBadge";
import ReelActionMenu, { LikeBurst } from "../components/ReelActionMenu";

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

      {/* V15 — Contextual reel actions live in ReelActionMenu (FAB).
          The global QuickActionsFAB is hidden on /reels by route filter,
          so this is the single floating control on this page. We also
          listen for "reels:open-creator" so the menu can ask us to open
          the upload modal. */}
      {user && (() => {
        if (!window._reelsCreatorListener) {
          window._reelsCreatorListener = () => setCreatorOpen(true);
          window.addEventListener("reels:open-creator", window._reelsCreatorListener);
        }
        return null;
      })()}
      {user && (
        <ReelActionMenu
          activeReel={reels[activeIdx]}
          onAfterUpload={() => load()}
          onAfterRecord={() => load()}
        />
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
function MetricPill({ Icon, value, testid, highlight }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-white" data-testid={testid}>
      <Icon
        className={`w-7 h-7 drop-shadow-lg transition-colors ${highlight ? "text-rose-400 fill-current" : ""}`}
      />
      <span className="text-[10px] font-bold drop-shadow tabular-nums">
        {(value || 0) > 999 ? `${(value / 1000).toFixed(1)}k` : (value || 0)}
      </span>
    </div>
  );
}

function ReelSlide({ reel, idx, isActive, muted, slideRef, videoRef, lang }) {
  const { user } = useAuth();
  const localVideoRef = useRef(null);
  const lastTapRef = useRef(0);
  const [liveLikes, setLiveLikes] = useState(reel.likes_count || 0);
  const [liked, setLiked] = useState(false);
  const [showBurst, setShowBurst] = useState(false);

  // Refresh likes-count + my-liked state when the reel changes.
  useEffect(() => {
    setLiveLikes(reel.likes_count || 0);
    if (!user) { setLiked(false); return; }
    let alive = true;
    api.get(`/reels/${reel.reel_id}/reactions/me`).then(r => {
      if (alive) setLiked(!!r.data?.liked);
    }).catch(() => {});
    return () => { alive = false; };
  }, [reel.reel_id, reel.likes_count, user]);

  // V15.1 — Double-tap to like (Instagram-style). Single tap toggles
  // play/pause; if a second tap arrives within 280ms we cancel the
  // play/pause and fire a like + LikeBurst overlay. Idempotent: tapping
  // twice on an already-liked reel does nothing (no unlike on double-tap
  // — the explicit toggle lives in the FAB action menu).
  const DOUBLE_TAP_MS = 280;
  const pendingTapRef = useRef(null);

  const fireLike = async () => {
    setShowBurst(true);
    setTimeout(() => setShowBurst(false), 900);
    if (!user) return;
    if (liked) return; // already liked → just play the animation, no API
    setLiked(true);
    setLiveLikes(n => n + 1);
    try {
      const r = await api.post(`/reels/${reel.reel_id}/like`);
      const isLiked = !!r.data?.liked;
      setLiked(isLiked);
      if (!isLiked) setLiveLikes(n => Math.max(0, n - 1));
    } catch {
      // soft-fail: leave optimistic UI in place
    }
  };

  const onTapVideo = () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // Double-tap → like + burst, cancel pending single-tap play/pause
      lastTapRef.current = 0;
      if (pendingTapRef.current) { clearTimeout(pendingTapRef.current); pendingTapRef.current = null; }
      fireLike();
      return;
    }
    lastTapRef.current = now;
    // Defer the play/pause toggle long enough to detect a 2nd tap.
    pendingTapRef.current = setTimeout(() => {
      const v = localVideoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
      pendingTapRef.current = null;
    }, DOUBLE_TAP_MS);
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
      {/* V15.1 — Double-tap LikeBurst overlay (fullscreen but scoped to
          this slide so it disappears once the next reel snaps in). */}
      {showBurst && <LikeBurst />}
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
              {reel.verified && <VerifiedBadge size={16} darkBg code={reel.getamano_code} />}
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

      {/* V15 — Right-side metrics rail (READ-ONLY). Actions moved to the
          ReelActionMenu FAB. We keep counts here so viewers see how the
          reel is doing. The owner sees the same numbers in their
          dashboard via /reels/me/metrics. */}
      <aside className="absolute right-3 bottom-24 flex flex-col items-center gap-3 pointer-events-none">
        <MetricPill Icon={Heart}     value={liveLikes}        testid={`reel-likes-${reel.reel_id}`}  highlight={liked} />
        <MetricPill Icon={Sparkles}  value={reel.wows_count}  testid={`reel-wows-${reel.reel_id}`} />
        <MetricPill Icon={Bookmark}  value={reel.saves_count} testid={`reel-saves-${reel.reel_id}`} />
        <MetricPill Icon={Share2}    value={reel.shares_count} testid={`reel-shares-${reel.reel_id}`} />
        {reel.provider_slug && (
          <Link
            to={`/p/${reel.provider_slug}`}
            className="pointer-events-auto flex flex-col items-center gap-0.5 text-white"
            data-testid={`reel-profile-${reel.reel_id}`}
          >
            <Eye className="w-8 h-8 drop-shadow-lg" />
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
