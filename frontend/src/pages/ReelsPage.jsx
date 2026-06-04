import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart, ChevronLeft, Volume2, VolumeX, Loader2,
  ShieldCheck, MapPin, Eye, Play, Sparkles, Bookmark, Share2, Plus,
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
import OwnerStatsPill from "../components/OwnerStatsPill";

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

  // V15 — Listen for `reels:open-creator` event so the FAB menu can
  // request opening the upload modal without prop-drilling.
  useEffect(() => {
    const handler = () => setCreatorOpen(true);
    window.addEventListener("reels:open-creator", handler);
    return () => window.removeEventListener("reels:open-creator", handler);
  }, []);

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
          so this is the single floating control on this page. */}
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
              ? "Anyone can post a 60-second vertical video. Tap + to be the first."
              : "Cualquier persona puede subir un video vertical de 60s. Toca + para ser el primero."}
          </p>
          {user && (
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              className="mt-5 px-5 h-11 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 text-white text-sm font-bold inline-flex items-center gap-2 active:scale-95 hover:shadow-xl transition-all duration-200"
              data-testid="reels-empty-cta"
            >
              <Plus className="w-4 h-4" />
              {lang === "en" ? "Post your first reel" : "Sube tu primer reel"}
            </button>
          )}
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
function ReelSlide({ reel, idx, isActive, muted, slideRef, videoRef, lang }) {
  const { user } = useAuth();
  const localVideoRef = useRef(null);

  // V18.3 — Replay a "settle-in" zoom when the slide becomes active
  // so swiping into a new reel feels physical. We bump a key tick so
  // the CSS class re-mounts.
  const [activeTick, setActiveTick] = useState(0);
  useEffect(() => {
    if (isActive) setActiveTick((n) => n + 1);
  }, [isActive]);
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
    // V17.7 — Magic moment: haptic pulse (stronger than the rail's 30ms
    // because double-tap is a deliberate gesture) + giant heart burst.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate([15, 40, 25]); } catch { /* desktop */ }
    }
    setShowBurst(true);
    setTimeout(() => setShowBurst(false), 900);
    if (!user) return;
    if (liked) {
      // Already liked → replay burst (delight) but no API call.
      // Still emit the event so the rail's heart pill stays in sync
      // for late-mounted listeners.
      window.dispatchEvent(new CustomEvent("reel:liked", { detail: { reel_id: reel.reel_id, liked: true } }));
      return;
    }
    setLiked(true);
    setLiveLikes(n => n + 1);
    // Tell the ReelActionMenu rail to flip the heart pill into the active
    // rose-pink gradient + bump the count without waiting for re-mount.
    window.dispatchEvent(new CustomEvent("reel:liked", { detail: { reel_id: reel.reel_id, liked: true } }));
    try {
      const r = await api.post(`/reels/${reel.reel_id}/like`);
      const isLiked = !!r.data?.liked;
      setLiked(isLiked);
      if (!isLiked) {
        setLiveLikes(n => Math.max(0, n - 1));
        window.dispatchEvent(new CustomEvent("reel:liked", { detail: { reel_id: reel.reel_id, liked: false } }));
      }
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
        key={`v-${activeTick}`}
        ref={(el) => { localVideoRef.current = el; videoRef(el); }}
        src={buildFileUrl(reel.video_url)}
        poster={reel.thumbnail_url ? buildFileUrl(reel.thumbnail_url) : undefined}
        className={`w-full h-full object-cover ${isActive ? "reel-video-active" : ""}`}
        loop
        playsInline
        muted={muted}
        onClick={onTapVideo}
        onPlay={() => {
          // V18.2 — Count one "play" the first time the video actually
          // starts. The backend throttles to once per 5 min per viewer.
          // Fire-and-forget — we don't await it because it shouldn't
          // block playback.
          if (user) {
            api.post(`/reels/${reel.reel_id}/play`).catch(() => {});
          }
        }}
        data-testid={`reel-video-${reel.reel_id}`}
      />
      {/* V15.1 — Double-tap LikeBurst overlay (fullscreen but scoped to
          this slide so it disappears once the next reel snaps in). */}
      {showBurst && <LikeBurst />}

      {/* V18.2 — Owner-only stats pill. The creator gets to see how
          many people viewed/played/liked their reel without exposing
          the numbers to everyone (privacy + cleaner UX for non-owners).
          Reels are owned via `provider_user_id` (the legacy field name
          predating V4's social-first rebrand). */}
      {user && (reel.provider_user_id === user.user_id || reel.user_id === user.user_id) && (
        <OwnerStatsPill
          kind="reel"
          views={reel.views_count || 0}
          plays={reel.plays_count || 0}
          likes={liveLikes}
        />
      )}

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
          <div className="flex-1 min-w-0 text-white" data-testid={`reel-author-${reel.reel_id}`}>
            <p className="font-bold text-sm inline-flex items-center gap-1" data-testid={`reel-author-name-${reel.reel_id}`}>
              {reel.business_name}
              {reel.verified
                ? <VerifiedBadge size={16} darkBg code={reel.getamano_code} />
                : <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full bg-white/15 text-white/70" data-testid={`reel-unverified-${reel.reel_id}`}>
                    {lang === "en" ? "Unverified" : "Sin verificar"}
                  </span>}
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

      {/* V17.5 — Metrics rail removed. The colored action pills in
          ReelActionMenu now show counts inline, eliminating the
          duplicate column the founder reported. The "Perfil" CTA
          moved to inline link near the caption instead. */}

      {/* Pause indicator (shown when video is paused via tap) */}
      <PausedIndicator videoRef={localVideoRef} />
    </section>
  );
}

function PausedIndicator({ videoRef }) {
  // V18.4 — Premium pause overlay (founder-requested "magic" moment).
  // Tap the video → pause → backdrop-blur intensifies + a giant
  // gradient Play button materialises in the center. Tap anywhere
  // again → resume + overlay fades out smoothly.
  //
  // The overlay sits ABOVE the rail (z-30) but BELOW any open modals
  // (the share/comments sheets get z-150+). pointer-events:none keeps
  // every action (rail clicks, caption links) live — only the
  // video element handles tap so a single tap continues to work as
  // play/pause.
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
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none z-30 transition-all duration-400 ${paused ? "opacity-100 backdrop-blur-md bg-black/25" : "opacity-0 backdrop-blur-0 bg-black/0"}`}
      data-testid="reel-paused-overlay"
      data-paused={paused ? "true" : "false"}
    >
      <div
        className={`w-24 h-24 rounded-full bg-gradient-to-br from-white/95 to-white/70 shadow-2xl flex items-center justify-center transition-transform duration-400 ${paused ? "scale-100" : "scale-50"}`}
        style={{
          filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.45))",
        }}
      >
        <Play className="w-12 h-12 text-slate-900 ml-1.5" fill="currentColor" strokeWidth={0} />
      </div>
    </div>
  );
}
