import { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { Plus, ShieldCheck, X, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Send, Eye, Trash2, Heart, Clock, Phone, Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buildFileUrl } from "./ImageUpload";
import { lazyImg } from "../lib/imageHelpers";
import LikeButton from "./LikeButton";
import useRefreshable from "../hooks/useRefreshable";

/**
 * StoriesCarousel — Section 60 (CEO recommendation).
 *
 * Instagram-style ephemeral stories that appear above the Community feed.
 *   - Horizontal scroll of avatar tiles (one per provider with active stories)
 *   - "+ Tu historia" tile for the logged-in provider
 *   - Tapping a tile opens a fullscreen viewer with the provider's stories
 *   - Auto-advance with progress bars (5s per slide)
 *   - Touch swipe to next/prev
 *
 * Backend: /api/stories endpoints — MongoDB TTL auto-deletes 24h after creation.
 */
const STORY_DURATION_MS = 5000;

export default function StoriesCarousel() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(-1); // index in groups, -1 = closed

  // Refresh active stories
  const fetchActive = useCallback(async () => {
    try {
      const { data } = await api.get("/stories/active?limit=30");
      setGroups(data || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchActive(); }, [fetchActive]);
  // Section 75 — pull-to-refresh: refresh the stories tile row too
  useRefreshable(fetchActive);

  const openViewer = (idx) => setViewerIdx(idx);
  const closeViewer = () => setViewerIdx(-1);
  const nextGroup = () => setViewerIdx((i) => (i + 1 < groups.length ? i + 1 : -1));
  const prevGroup = () => setViewerIdx((i) => (i - 1 >= 0 ? i - 1 : i));

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto py-3 px-1 -mx-1 scrollbar-none" data-testid="stories-carousel-loading">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-16 h-20 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  // Show nothing if no stories AND user is not a provider
  if (!groups.length && user?.role !== "provider") return null;

  // Section 76 — Identify the logged-in provider's OWN tile in the
  // active list so we can render it first with a "+" overlay (Instagram
  // pattern), instead of a separate floating "+ Tu historia" tile.
  const myIdx = user?.role === "provider" ? groups.findIndex(g => g.provider_user_id === user.user_id) : -1;
  const myGroup = myIdx >= 0 ? groups[myIdx] : null;
  const otherGroups = myIdx >= 0 ? groups.filter((_, i) => i !== myIdx) : groups;

  // Stories created in the last 60 minutes get a subtle pulse animation —
  // "there's something new" social-network cue.
  const isFresh = (g) => {
    if (!g?.created_at) return false;
    const t = new Date(g.created_at).getTime();
    if (Number.isNaN(t)) return false;
    return (Date.now() - t) < 60 * 60 * 1000;
  };

  return (
    <>
      <div className="mb-4" data-testid="stories-carousel">
        <div className="flex gap-3 overflow-x-auto pb-3 px-1 -mx-1 scrollbar-none">
          {/* Logged-in provider's tile — shown first.
              - WITH active stories: tap opens viewer, "+" badge overlays
                the avatar so they can add another segment.
              - WITHOUT stories: tap opens creator. */}
          {user?.role === "provider" && (
            myGroup ? (
              <div
                className="flex-shrink-0 flex flex-col items-center gap-1.5 group relative"
                data-testid="story-tile-self"
              >
                <button
                  type="button"
                  onClick={() => {
                    const idx = groups.findIndex(g => g.provider_user_id === user.user_id);
                    if (idx >= 0) openViewer(idx);
                  }}
                  className="relative w-[72px] h-[72px] rounded-full p-[2.5px] group-hover:scale-105 transition will-change-transform"
                  style={{ background: "linear-gradient(135deg, #ec4899 0%, #f97316 50%, #f43f5e 100%)" }}
                  aria-label={lang === "en" ? "View your story" : "Ver tu historia"}
                >
                  <div className="w-full h-full rounded-full p-[2px] bg-white">
                    {myGroup.logo_url ? (
                      <img {...lazyImg(buildFileUrl(myGroup.logo_url))} alt="" className="w-full h-full rounded-full object-cover bg-slate-100" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-base font-bold text-teal-700">
                        {(myGroup.business_name || user?.name || "?")[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                </button>
                {/* "+" badge overlay — tap to add another story */}
                <button
                  type="button"
                  onClick={() => setShowCreator(true)}
                  className="absolute top-[42px] left-[42px] w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center ring-2 ring-white shadow-md hover:scale-110 transition will-change-transform"
                  data-testid="story-add-badge"
                  aria-label={lang === "en" ? "Add story" : "Agregar historia"}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
                <span className="text-[11px] font-medium text-slate-700 max-w-[72px] truncate">
                  {lang === "en" ? "Your story" : "Tu historia"}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreator(true)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 group"
                data-testid="story-create-tile"
              >
                <div className="relative w-[72px] h-[72px] rounded-full p-[2.5px] group-hover:scale-105 transition will-change-transform" style={{ background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)" }}>
                  <div className="w-full h-full rounded-full bg-slate-50 border-2 border-dashed border-teal-400 flex items-center justify-center">
                    <Plus className="w-7 h-7 text-teal-600" strokeWidth={2.5} />
                  </div>
                </div>
                <span className="text-[11px] font-medium text-slate-600 max-w-[72px] truncate">
                  {lang === "en" ? "Add story" : "Tu historia"}
                </span>
              </button>
            )
          )}

          {/* Other providers' story tiles */}
          {otherGroups.map((g) => {
            const realIdx = groups.findIndex(x => x.provider_user_id === g.provider_user_id);
            const fresh = isFresh(g);
            return (
              <StoryTile
                key={g.provider_user_id}
                group={g}
                fresh={fresh}
                onOpen={() => openViewer(realIdx)}
              />
            );
          })}
        </div>
      </div>

      {/* Viewer Modal */}
      {viewerIdx >= 0 && groups[viewerIdx] && (
        <StoryViewer
          group={groups[viewerIdx]}
          onClose={closeViewer}
          onNext={nextGroup}
          onPrev={prevGroup}
          hasNext={viewerIdx + 1 < groups.length}
          hasPrev={viewerIdx > 0}
        />
      )}

      {/* Creator Modal */}
      {showCreator && (
        <StoryCreator
          onClose={() => setShowCreator(false)}
          onCreated={() => { setShowCreator(false); fetchActive(); }}
        />
      )}
    </>
  );
}

/**
 * StoryTile — single avatar circle in the carousel with optional desktop
 * hover preview. On `pointerenter` (mouse/trackpad only, NOT touch), we
 * show a small floating popover with the latest story thumbnail + caption,
 * giving desktop users a quick peek before committing to open the viewer.
 *
 * The hover only triggers for pointers that have `pointerType === "mouse"`
 * — coarse-pointer (touch) devices never see the popover, preserving the
 * mobile interaction (tap → open viewer directly).
 */
function StoryTile({ group, fresh, onOpen }) {
  const g = group;
  const [hover, setHover] = useState(false);
  const tileRef = useRef(null);

  const onPointerEnter = (e) => {
    if (e.pointerType !== "mouse") return;
    setHover(true);
  };
  const onPointerLeave = () => setHover(false);

  return (
    <div
      ref={tileRef}
      className="relative flex-shrink-0"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col items-center gap-1.5 group"
        data-testid={`story-tile-${g.provider_user_id}`}
      >
        <div
          className={`relative w-[72px] h-[72px] rounded-full p-[2.5px] group-hover:scale-105 transition will-change-transform ${fresh ? "gtm-story-pulse" : ""}`}
          style={{ background: "linear-gradient(135deg, #ec4899 0%, #f97316 50%, #f43f5e 100%)" }}
        >
          <div className="w-full h-full rounded-full p-[2px] bg-white">
            {g.logo_url ? (
              <img
                {...lazyImg(buildFileUrl(g.logo_url))}
                alt=""
                className="w-full h-full rounded-full object-cover bg-slate-100"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-base font-bold text-teal-700">
                {(g.business_name || "?")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          {g.stories_count > 1 && (
            <span className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white" data-testid={`story-tile-count-${g.provider_user_id}`}>
              {g.stories_count}
            </span>
          )}
          {g.likes_count > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold ring-2 ring-white shadow-sm" data-testid={`story-tile-likes-${g.provider_user_id}`}>
              <Heart className="w-2.5 h-2.5" fill="currentColor" strokeWidth={0} />
              {g.likes_count}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium text-slate-700 max-w-[72px] truncate inline-flex items-center gap-0.5">
          <span className="truncate">{g.business_name}</span>
          {g.verified && <ShieldCheck className="w-2.5 h-2.5 flex-shrink-0 text-emerald-500" />}
        </span>
      </button>

      {hover && g.image_url && (
        <div
          className="hidden md:block absolute left-1/2 -translate-x-1/2 top-[88px] z-30 w-44 rounded-xl overflow-hidden shadow-2xl ring-1 ring-black/10 pointer-events-none gtm-story-hover-pop"
          data-testid={`story-tile-hover-${g.provider_user_id}`}
        >
          <div className="aspect-[3/5] bg-slate-900 relative">
            <img
              src={buildFileUrl(g.image_url)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 px-2.5 py-2 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-white text-[11px] font-semibold truncate">{g.business_name}</p>
              {g.caption ? (
                <p className="text-white/80 text-[10px] line-clamp-2 mt-0.5">{g.caption}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * StoryViewer — fullscreen modal that plays a single provider's stories in
 * sequence with auto-advancing 5s progress bars (Instagram-style).
 */
function StoryViewer({ group, onClose, onNext, onPrev, hasNext, hasPrev }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef(null);
  // Section 61 — Story like state
  const [likeStates, setLikeStates] = useState({}); // story_id → liked bool
  const [likePending, setLikePending] = useState({});
  // Section 72.5 — Double-tap to like + giant center heart animation
  const [centerHeart, setCenterHeart] = useState(0); // increment to retrigger anim
  const lastTapRef = useRef(0);

  // Section 77 — Horizontal swipe between providers (Instagram pattern).
  // Touch a story image, drag left/right > 60px, release → go to prev/next group.
  const swipeRef = useRef({ x: 0, y: 0, active: false });
  const SWIPE_THRESHOLD = 60;
  const handleSwipeStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const handleSwipeEnd = (e) => {
    const s = swipeRef.current;
    if (!s.active) return;
    swipeRef.current = { x: 0, y: 0, active: false };
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Ignore vertical-dominant swipes (those are scroll/dismiss gestures)
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && hasNext) onNext();
    else if (dx > 0 && hasPrev) onPrev();
  };

  const isOwner = user && group && user.user_id === group.provider_user_id;

  useEffect(() => {
    let alive = true;
    api.get(`/stories/by-provider/${group.provider_user_id}`)
      .then(r => { if (alive) { setStories(r.data || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [group.provider_user_id]);

  // Track view on each story shown
  useEffect(() => {
    const s = stories[activeIdx];
    if (s) api.post(`/stories/${s.story_id}/view`).catch(() => {});
  }, [stories, activeIdx]);

  // Hydrate like state for current story (for non-owner viewers)
  useEffect(() => {
    const s = stories[activeIdx];
    if (!s || isOwner || !user) return;
    if (likeStates[s.story_id] !== undefined) return; // already loaded
    api.get(`/stories/${s.story_id}/like-state`).then((r) => {
      setLikeStates((cur) => ({ ...cur, [s.story_id]: !!r.data.liked }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, stories, isOwner, user]);

  const toggleStoryLike = async () => {
    const s = stories[activeIdx];
    if (!s || isOwner) return;
    if (!user) {
      toast.message(lang === "en" ? "Sign in to like stories" : "Inicia sesión para dar like");
      return;
    }
    if (likePending[s.story_id]) return;
    setLikePending((cur) => ({ ...cur, [s.story_id]: true }));
    const wasLiked = !!likeStates[s.story_id];
    setLikeStates((cur) => ({ ...cur, [s.story_id]: !wasLiked }));
    // Trigger big center-heart burst when transitioning to liked
    if (!wasLiked) setCenterHeart((n) => n + 1);
    // Optimistic count update on the story object
    setStories((cur) => cur.map((st, i) => i === activeIdx ? { ...st, likes_count: (st.likes_count || 0) + (wasLiked ? -1 : 1) } : st));
    try {
      const { data } = await api.post(`/stories/${s.story_id}/like`);
      setLikeStates((cur) => ({ ...cur, [s.story_id]: data.liked }));
      setStories((cur) => cur.map((st, i) => i === activeIdx ? { ...st, likes_count: data.likes_count } : st));
    } catch (e) {
      // revert
      setLikeStates((cur) => ({ ...cur, [s.story_id]: wasLiked }));
      setStories((cur) => cur.map((st, i) => i === activeIdx ? { ...st, likes_count: (st.likes_count || 0) + (wasLiked ? 1 : -1) } : st));
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setLikePending((cur) => { const n = { ...cur }; delete n[s.story_id]; return n; });
    }
  };

  // Double-tap on the story image → trigger like (Instagram pattern).
  // Only fires the API call when the user goes from unliked → liked.
  const handleImageTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      const s = stories[activeIdx];
      if (!s || isOwner || !user) return;
      if (likeStates[s.story_id]) {
        // Already liked — still flash the heart for delight
        setCenterHeart((n) => n + 1);
        return;
      }
      toggleStoryLike();
    } else {
      lastTapRef.current = now;
    }
  };

  const deleteStory = async () => {
    const s = stories[activeIdx];
    if (!s || !isOwner) return;
    if (!window.confirm(lang === "en" ? "Delete this story?" : "¿Eliminar esta historia?")) return;
    try {
      await api.delete(`/stories/${s.story_id}`);
      toast.success(lang === "en" ? "Story deleted" : "Historia eliminada");
      const remaining = stories.filter((_, i) => i !== activeIdx);
      if (remaining.length === 0) onClose();
      else {
        setStories(remaining);
        if (activeIdx >= remaining.length) setActiveIdx(remaining.length - 1);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  // Escape-to-close (Section 58 polish)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goLeft();
      else if (e.key === "ArrowRight") goRight();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, stories.length, hasNext, hasPrev]);

  // Auto-advance progress
  useEffect(() => {
    if (!stories.length || paused) return;
    setProgress(0);
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / STORY_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(intervalRef.current);
        if (activeIdx + 1 < stories.length) setActiveIdx(activeIdx + 1);
        else if (hasNext) onNext();
        else onClose();
      }
    }, 50);
    return () => clearInterval(intervalRef.current);
  }, [activeIdx, stories, paused, hasNext, onNext, onClose]);

  const goLeft = () => {
    if (activeIdx > 0) setActiveIdx(activeIdx - 1);
    else if (hasPrev) onPrev();
  };
  const goRight = () => {
    if (activeIdx + 1 < stories.length) setActiveIdx(activeIdx + 1);
    else if (hasNext) onNext();
    else onClose();
  };

  const active = stories[activeIdx];

  return createPortal((
    <div
      className="fixed inset-0 z-[120] bg-black flex items-center justify-center"
      style={{ height: "100vh", maxHeight: "100vh" }}
      data-testid="story-viewer"
      data-no-ptr="true"
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onTouchStart={(e) => { setPaused(true); handleSwipeStart(e); }}
      onTouchEnd={(e) => { setPaused(false); handleSwipeEnd(e); }}
      onTouchCancel={() => { setPaused(false); swipeRef.current = { x: 0, y: 0, active: false }; }}
    >
      {loading ? (
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      ) : !active ? (
        <p className="text-white">—</p>
      ) : (
        <>
          {/* Progress bars */}
          <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
            {stories.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: i < activeIdx ? "100%" : i === activeIdx ? `${progress}%` : "0%" }}
                />
              </div>
            ))}
          </div>

          {/* Header row */}
          <div className="absolute top-7 left-3 right-3 flex items-center gap-3 z-10">
            <Link
              to={active.provider_slug ? `/p/${active.provider_slug}` : "#"}
              className="flex items-center gap-2 flex-1 min-w-0 group"
              data-testid="story-viewer-provider-link"
            >
              {group.logo_url ? (
                <img {...lazyImg(buildFileUrl(group.logo_url), { priority: true })} alt="" className="w-9 h-9 rounded-full ring-2 ring-white object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full ring-2 ring-white bg-gradient-to-br from-teal-200 to-teal-300 flex items-center justify-center text-sm font-bold text-teal-800 flex-shrink-0">
                  {(group.business_name || "?")[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {group.business_name}
                  {active.verified && <ShieldCheck className="w-3 h-3 inline-block ml-1 text-emerald-400" />}
                </p>
                <p className="text-white/60 text-[11px]">{lang === "en" ? "Tap to view" : "Toca para ver"}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white"
              data-testid="story-viewer-close"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Vignette gradient — improves readability of caption + action buttons on any image */}
          <div className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none z-[1] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-32 pointer-events-none z-[1] bg-gradient-to-b from-black/50 to-transparent" />

          {/* Story image — tap area also handles double-tap-to-like */}
          <img
            {...lazyImg(buildFileUrl(active.image_url), { priority: true })}
            alt={active.caption || group.business_name}
            className="object-contain select-none"
            style={{ maxWidth: "100%", maxHeight: "100vh", width: "auto", height: "auto" }}
            data-testid="story-viewer-image"
            onClick={handleImageTap}
            draggable={false}
          />

          {/* Section 78 — Sticker overlays positioned on the image canvas.
              These render on the SAME aspect-fit container as the image so
              percentage coords (0-100) translate to pixel-accurate spots. */}
          {Array.isArray(active.stickers) && active.stickers.length > 0 && (
            <div className="absolute inset-0 z-[5] pointer-events-none" data-testid="story-viewer-stickers">
              {active.stickers.map(s => <StickerOverlay key={s.id} sticker={s} />)}
            </div>
          )}

          {/* Giant center-screen heart burst on like (Instagram-style) */}
          {centerHeart > 0 && (
            <CenterHeartBurst key={centerHeart} />
          )}

          {/* Caption */}
          {active.caption && (
            <div className="absolute bottom-20 left-6 right-6 z-10">
              <p className="text-white text-base font-medium drop-shadow-lg text-center leading-snug px-4">
                {active.caption}
              </p>
            </div>
          )}

          {/* Section 61 — Story actions: like (for viewers) OR views/likes counter (for owner) */}
          {isOwner ? (
            <div className="absolute left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-auto" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-black/60 backdrop-blur text-white text-sm font-semibold shadow-md" data-testid="story-views-count">
                  <Eye className="w-4 h-4" /> {active.views_count || 0}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-black/60 backdrop-blur text-rose-300 text-sm font-semibold shadow-md gtm-like-btn" data-liked="1" data-testid="story-likes-count">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 gtm-heart"><path d="M12 21s-7-4.5-9.5-9C.5 8.5 2 5 5 5c1.7 0 3.3.9 4 2.4C9.7 5.9 11.3 5 13 5c3 0 4.5 3.5 2.5 7C19 16.5 12 21 12 21z"/></svg>
                  {active.likes_count || 0}
                </span>
                <ExpiryBadge expiresAt={active.expires_at} lang={lang} />
              </div>
              <button
                type="button"
                onClick={deleteStory}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-black/60 hover:bg-rose-500/80 backdrop-blur text-white text-xs font-semibold transition"
                data-testid="story-owner-delete"
                aria-label={lang === "en" ? "Delete story" : "Eliminar historia"}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {lang === "en" ? "Delete" : "Eliminar"}
              </button>
            </div>
          ) : (
            <div className="absolute left-4 z-10 pointer-events-auto" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }} data-testid="story-viewer-actions">
              <LikeButton
                liked={!!likeStates[active.story_id]}
                count={active.likes_count || 0}
                onClick={toggleStoryLike}
                disabled={!!likePending[active.story_id]}
                size="lg"
                variant="floating"
                testid="story-viewer-like"
                ariaLabel={lang === "en" ? "Like this story" : "Dar like a esta historia"}
                celebrationLevel="milestone"
              />
              <p className="text-white/70 text-[10px] font-medium mt-1.5 ml-2 drop-shadow-md select-none">
                {lang === "en" ? "Double-tap to like" : "Doble toque para dar like"}
              </p>
            </div>
          )}

          {/* Touch areas for prev/next */}
          <button type="button" onClick={goLeft} className="absolute left-0 top-0 bottom-0 w-1/3" aria-label="Previous" data-testid="story-viewer-prev" />
          <button type="button" onClick={goRight} className="absolute right-0 top-0 bottom-0 w-1/3" aria-label="Next" data-testid="story-viewer-next" />

          {/* Visible chevrons for desktop */}
          {(activeIdx > 0 || hasPrev) && (
            <button type="button" onClick={goLeft} className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 items-center justify-center text-white z-10">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <button type="button" onClick={goRight} className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 items-center justify-center text-white z-10">
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  ), document.body);
}

/**
 * CenterHeartBurst — Instagram-style giant heart that pops in the middle
 * of the story when the user double-taps OR likes via button. Mounted with
 * a `key` prop bound to a counter so each like remounts the element and
 * replays the animation. CSS-only — see `gtm-center-heart` keyframes in
 * `index.css`.
 */
function CenterHeartBurst() {
  return (
    <div className="absolute inset-0 z-[12] flex items-center justify-center pointer-events-none" data-testid="story-center-heart">
      <Heart
        className="gtm-center-heart text-rose-500 drop-shadow-[0_8px_24px_rgba(244,63,94,0.6)]"
        style={{ width: 160, height: 160 }}
        fill="currentColor"
        strokeWidth={0}
      />
    </div>
  );
}

/**
 * StickerVisual — renders a single sticker in the same way for both the
 * editor preview and the published story viewer. Three flavors:
 *   · phone : green tap-to-call pill with a 📞 icon, text shows phone digits.
 *   · promo : rose gradient pill with 🔥 icon + bold text — animated shimmer.
 *   · tip   : amber pill with ✨ icon — calmer.
 *
 * Designed to be readable on any photo (drop-shadow + opaque background).
 * Renders the same DOM for editor + viewer so positioning at runtime is
 * pixel-identical to what the provider saw while editing.
 */
function StickerVisual({ sticker }) {
  const { type } = sticker;
  if (type === "phone") {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-emerald-500 text-white text-sm font-bold shadow-xl ring-2 ring-white/70 whitespace-nowrap">
        <Phone className="w-4 h-4" fill="currentColor" strokeWidth={0} />
        <span>{sticker.phone || "+1 ___"}</span>
      </div>
    );
  }
  if (type === "promo") {
    return (
      <div className="relative inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-white text-sm font-extrabold shadow-xl ring-2 ring-white/70 whitespace-nowrap overflow-hidden gtm-sticker-promo" style={{ background: "linear-gradient(120deg, #ec4899, #f97316, #ef4444)" }}>
        <Flame className="w-4 h-4 relative z-10" fill="currentColor" strokeWidth={0} />
        <span className="relative z-10">{sticker.text || "Promo"}</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-amber-400 text-amber-950 text-sm font-bold shadow-xl ring-2 ring-white/70 whitespace-nowrap">
      <Sparkles className="w-4 h-4" />
      <span>{sticker.text || "Pro tip"}</span>
    </div>
  );
}

/**
 * StickerOverlay — what the VIEWER (clients) sees on a published story.
 * Same `StickerVisual` body, but wrapped in a tap target that:
 *   · phone → opens a `tel:` link (native iOS/Android dialer)
 *   · promo / tip → no-op (visual only)
 */
function StickerOverlay({ sticker }) {
  const common = {
    style: { left: `${sticker.x}%`, top: `${sticker.y}%`, transform: "translate(-50%, -50%)" },
    className: "absolute pointer-events-auto",
    "data-testid": `story-sticker-${sticker.type}`,
  };
  if (sticker.type === "phone" && sticker.phone) {
    return (
      <a
        href={`tel:${sticker.phone.replace(/[^+0-9]/g, "")}`}
        {...common}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Llamar ${sticker.phone}`}
      >
        <StickerVisual sticker={sticker} />
      </a>
    );
  }
  return (
    <div {...common} role="presentation">
      <StickerVisual sticker={sticker} />
    </div>
  );
}

/**
 * ExpiryBadge — pill showing "Expira en Xh" (or "Xm" / "Xs") so the
 * story owner knows how much time is left before MongoDB TTL deletes
 * it (24h after creation). Updates every 30s while open.
 */
function ExpiryBadge({ expiresAt, lang }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return null;
  const exp = new Date(expiresAt).getTime();
  const diffMs = exp - now;
  if (Number.isNaN(diffMs)) return null;
  let label;
  if (diffMs <= 0) {
    label = lang === "en" ? "Expired" : "Expiró";
  } else {
    const totalMin = Math.floor(diffMs / 60_000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours >= 1) {
      label = lang === "en" ? `Expires in ${hours}h ${mins}m` : `Expira en ${hours}h ${mins}m`;
    } else if (totalMin >= 1) {
      label = lang === "en" ? `Expires in ${totalMin}m` : `Expira en ${totalMin}m`;
    } else {
      label = lang === "en" ? "Expires in <1m" : "Expira en <1m";
    }
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-black/60 backdrop-blur text-amber-200 text-xs font-semibold shadow-md"
      data-testid="story-expiry-countdown"
    >
      <Clock className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

/**
 * StoryCreator — modal that uploads a photo + caption and creates a 24h story.
 */
function StoryCreator({ onClose, onCreated }) {
  const { lang } = useI18n();
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stickers, setStickers] = useState([]); // Section 78
  const [editingStickerId, setEditingStickerId] = useState(null);
  const inputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error(lang === "en" ? "Image too large (8MB max)" : "Imagen muy grande (máx 8MB)");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      setImageUrl(data?.url || "");
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Upload failed" : "Falla en la subida"));
      setPreview("");
    } finally {
      setUploading(false);
    }
  };

  // Section 78 — Sticker helpers
  const addSticker = (type) => {
    if (stickers.length >= 3) {
      toast.message(lang === "en" ? "Max 3 stickers" : "Máximo 3 stickers");
      return;
    }
    const id = `sti_${Date.now().toString(36)}`;
    const defaults = {
      phone:  { text: null, phone: "" },
      promo:  { text: lang === "en" ? "20% OFF Today" : "20% OFF Hoy", phone: null },
      tip:    { text: lang === "en" ? "Pro tip" : "Pro tip", phone: null },
    }[type];
    setStickers((cur) => [...cur, { id, type, x: 50, y: 50, ...defaults }]);
    setEditingStickerId(id);
  };
  const removeSticker = (id) => {
    setStickers((cur) => cur.filter(s => s.id !== id));
    if (editingStickerId === id) setEditingStickerId(null);
  };
  const updateSticker = (id, patch) => {
    setStickers((cur) => cur.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  // Drag handler — converts pointer coords into 0-100% within the canvas
  const dragSticker = (id, e) => {
    if (uploading || creating) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const move = (ev) => {
      const cx = ev.touches?.[0]?.clientX ?? ev.clientX;
      const cy = ev.touches?.[0]?.clientY ?? ev.clientY;
      const x = ((cx - rect.left) / rect.width) * 100;
      const y = ((cy - rect.top) / rect.height) * 100;
      updateSticker(id, { x: Math.max(4, Math.min(96, x)), y: Math.max(4, Math.min(96, y)) });
    };
    const end = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
  };

  const submit = async () => {
    if (!imageUrl) return;
    // Pre-validate sticker payloads
    for (const s of stickers) {
      if (s.type === "phone" && !(s.phone || "").trim()) {
        toast.error(lang === "en" ? "Phone sticker needs a number" : "El sticker de teléfono necesita un número");
        return;
      }
      if (s.type !== "phone" && !(s.text || "").trim()) {
        toast.error(lang === "en" ? "Promo/Tip sticker needs text" : "El sticker necesita texto");
        return;
      }
    }
    setCreating(true);
    try {
      await api.post("/stories", {
        image_url: imageUrl,
        caption: caption.trim() || null,
        stickers: stickers.length ? stickers.map(s => ({
          id: s.id, type: s.type, x: s.x, y: s.y,
          text: s.text || null, phone: s.phone || null,
        })) : null,
      });
      toast.success(lang === "en" ? "Story posted!" : "¡Historia publicada!");
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't post" : "No se pudo publicar"));
    } finally {
      setCreating(false);
    }
  };

  return createPortal((
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading && !creating) onClose(); }}
      data-testid="story-creator-modal"
    >
      <div className="bg-white rounded-3xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg text-slate-900">
            {lang === "en" ? "New 24h story" : "Nueva historia de 24h"}
          </h3>
          <button type="button" onClick={onClose} disabled={uploading || creating} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 disabled:opacity-50" data-testid="story-creator-close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image picker */}
        <div className="mb-4">
          {!preview ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full aspect-[4/5] rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-500 flex flex-col items-center justify-center text-slate-400 hover:text-teal-600 transition"
              data-testid="story-creator-pick"
            >
              <ImageIcon className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">{lang === "en" ? "Tap to add a photo" : "Toca para agregar foto"}</p>
              <p className="text-xs">{lang === "en" ? "Max 8MB · JPG/PNG/WebP" : "Máx 8MB · JPG/PNG/WebP"}</p>
            </button>
          ) : (
            <div ref={canvasRef} className="relative aspect-[4/5] rounded-2xl bg-slate-100 overflow-hidden select-none" data-testid="story-creator-canvas">
              <img src={preview} alt="preview" className="w-full h-full object-cover pointer-events-none" />
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-xs mt-2">{lang === "en" ? "Uploading..." : "Subiendo..."}</p>
                </div>
              )}
              {!uploading && (
                <button
                  type="button"
                  onClick={() => { setPreview(""); setImageUrl(""); setStickers([]); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-20"
                  data-testid="story-creator-clear"
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Section 78 — Draggable sticker overlays on the editor canvas */}
              {stickers.map(s => (
                <div
                  key={s.id}
                  className={`absolute z-10 cursor-move touch-none ${editingStickerId === s.id ? "ring-2 ring-white ring-offset-2 ring-offset-black/30 rounded-2xl" : ""}`}
                  style={{ left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%, -50%)" }}
                  onMouseDown={(e) => { setEditingStickerId(s.id); dragSticker(s.id, e); }}
                  onTouchStart={(e) => { setEditingStickerId(s.id); dragSticker(s.id, e); }}
                  data-testid={`story-creator-sticker-${s.type}`}
                >
                  <StickerVisual sticker={s} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSticker(s.id); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"
                    aria-label="Eliminar sticker"
                    data-testid={`story-creator-sticker-remove-${s.id}`}
                  >
                    <X className="w-3 h-3" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
            data-testid="story-creator-input"
          />
        </div>

        {/* Section 78 — Sticker toolbar + per-sticker editors.
            Only shown when an image is loaded. */}
        {imageUrl && !uploading && (
          <div className="mb-4" data-testid="story-creator-sticker-toolbar">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{lang === "en" ? "Add stickers" : "Stickers"} <span className="text-slate-400 normal-case">({stickers.length}/3)</span></p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => addSticker("phone")} disabled={stickers.length >= 3} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-40 transition" data-testid="story-add-sticker-phone">
                <Phone className="w-3.5 h-3.5" /> {lang === "en" ? "Call me" : "Llámame"}
              </button>
              <button type="button" onClick={() => addSticker("promo")} disabled={stickers.length >= 3} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 disabled:opacity-40 transition" data-testid="story-add-sticker-promo">
                <Flame className="w-3.5 h-3.5" /> {lang === "en" ? "Promo" : "Promo"}
              </button>
              <button type="button" onClick={() => addSticker("tip")} disabled={stickers.length >= 3} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 disabled:opacity-40 transition" data-testid="story-add-sticker-tip">
                <Sparkles className="w-3.5 h-3.5" /> {lang === "en" ? "Pro tip" : "Pro tip"}
              </button>
            </div>
            {stickers.length > 0 && (
              <div className="mt-3 space-y-2">
                {stickers.map(s => (
                  <div key={s.id} className="flex items-center gap-2" data-testid={`story-sticker-editor-${s.id}`}>
                    <span className="text-[11px] font-bold uppercase tracking-wide w-12 text-slate-500">{s.type}</span>
                    {s.type === "phone" ? (
                      <input
                        value={s.phone || ""}
                        onChange={(e) => updateSticker(s.id, { phone: e.target.value })}
                        placeholder="+1 555 123 4567"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        data-testid={`story-sticker-input-${s.id}`}
                        inputMode="tel"
                        maxLength={24}
                      />
                    ) : (
                      <input
                        value={s.text || ""}
                        onChange={(e) => updateSticker(s.id, { text: e.target.value })}
                        placeholder={s.type === "promo" ? (lang === "en" ? "20% OFF Today" : "20% OFF Hoy") : (lang === "en" ? "Insider tip" : "Tip pro")}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        data-testid={`story-sticker-input-${s.id}`}
                        maxLength={40}
                      />
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 italic">{lang === "en" ? "Drag stickers on the photo to position." : "Arrastra los stickers en la foto para posicionarlos."}</p>
              </div>
            )}
          </div>
        )}

        {/* Caption */}
        <div className="mb-4">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={lang === "en" ? "Add a short caption (optional, 140 chars)" : "Agrega un texto corto (opcional, 140 chars)"}
            maxLength={140}
            rows={2}
            className="w-full p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none"
            data-testid="story-creator-caption"
          />
          <div className="text-right text-[11px] text-slate-400 mt-1">{caption.length}/140</div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading || creating}
            className="flex-1 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium disabled:opacity-60"
            data-testid="story-creator-cancel"
          >
            {lang === "en" ? "Cancel" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!imageUrl || uploading || creating}
            className="flex-1 h-11 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="story-creator-submit"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {creating ? (lang === "en" ? "Posting..." : "Publicando...") : (lang === "en" ? "Post story" : "Publicar")}
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-3">
          {lang === "en" ? "⏱️ Your story auto-deletes in 24h" : "⏱️ Tu historia se borra sola en 24h"}
        </p>
      </div>
    </div>
  ), document.body);
}
