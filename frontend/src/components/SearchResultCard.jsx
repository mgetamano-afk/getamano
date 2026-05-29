import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Star,
  ShieldCheck,
  Video,
  Navigation,
  Heart,
  Eye,
  ChevronLeft,
  ChevronRight,
  Zap,
  MessageSquare,
  Bookmark,
} from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import OwnerIdentityBadge from "./OwnerIdentityBadge";
import TrustScore from "./TrustScore";
import { useI18n } from "../contexts/I18nContext";

/**
 * SearchResultCard — Airbnb-style expanded eCard miniature for /buscar.
 *
 * Shows: hero photo carousel (gallery[] fallback to cover_url) with overlay
 * badges (Verified, Video, OwnerIdentity), then below: category chip, business
 * name, rating + review count, city + distance, description (2-line clamp),
 * services chips (max 3 + "+N"), and a stats footer (likes, views, fast
 * responder hint).
 *
 * NO price is rendered here by product request — pricing is revealed only on
 * the full eCard page when the client opens the profile.
 *
 * Section 75 — adds an Airbnb-style "Save to shortlist" button on the hero
 * photo. Toggles via the `onToggleSave(providerId)` callback. Parent owns
 * the saved state via `isSaved` so the same component drives both /buscar
 * and any future "Saved tab" reuse without re-fetching per card.
 */
export default function SearchResultCard({ provider, isSaved = false, onToggleSave }) {
  const { t, lang } = useI18n();
  const p = provider || {};
  const [imgIdx, setImgIdx] = useState(0);

  // Build the photo list: gallery first (sorted), then cover, then logo as last
  // resort. Dedupe so we never repeat the same URL twice.
  const photos = useMemo(() => {
    const list = [];
    const seen = new Set();
    const push = (url) => {
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push(url);
      }
    };
    const sortedGallery = Array.isArray(p.gallery)
      ? [...p.gallery].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        )
      : [];
    sortedGallery.forEach((g) => push(g.url));
    push(p.cover_url);
    return list;
  }, [p.gallery, p.cover_url]);

  const safeIdx = photos.length > 0 ? Math.min(imgIdx, photos.length - 1) : 0;
  const currentPhoto = photos[safeIdx];
  const hasMultiple = photos.length > 1;

  const prevPhoto = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIdx((i) => (i - 1 + photos.length) % photos.length);
  };
  const nextPhoto = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIdx((i) => (i + 1) % photos.length);
  };

  const ratingNum = Number(p.rating_avg || 0);
  const reviewCount = Number(p.rating_count || 0);
  const likes = Number(p.likes_count || 0);
  const views = Number(p.views || 0);
  // "Responde rápido" hint surfaced only when there's enough engagement data
  // to suggest the provider is responsive (≥3 reviews + ≥4★). Cheap proxy
  // until the full badge engine is wired into the search response.
  const fastResponder = reviewCount >= 3 && ratingNum >= 4;
  const services = Array.isArray(p.services)
    ? p.services.filter(Boolean).slice(0, 3)
    : [];
  const extraServices = Array.isArray(p.services)
    ? Math.max(0, p.services.length - 3)
    : 0;

  return (
    <Link
      to={`/provider/${p.slug}`}
      className="card-lift group bg-white rounded-2xl border border-slate-200 overflow-hidden block focus:outline-none focus:ring-2 focus:ring-offset-2"
      style={{ outlineColor: "#0077B6" }}
      data-testid={`result-card-${p.slug}`}
    >
      {/* ── Hero photo ─────────────────────────────────────────────── */}
      <div
        className="relative bg-slate-100 overflow-hidden"
        style={{ aspectRatio: "16 / 10" }}
        data-testid={`result-card-photo-${p.slug}`}
      >
        {currentPhoto ? (
          <img
            src={currentPhoto}
            alt={p.business_name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <CategoryIcon
              slug={p.category?.slug}
              size={48}
              color="#94A3B8"
              stroke={1.5}
            />
          </div>
        )}

        {/* Carousel controls — only when >1 photo */}
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={prevPhoto}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              data-testid={`result-card-prev-${p.slug}`}
            >
              <ChevronLeft className="w-4 h-4" style={{ color: "#03045E" }} />
            </button>
            <button
              type="button"
              onClick={nextPhoto}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
              data-testid={`result-card-next-${p.slug}`}
            >
              <ChevronRight className="w-4 h-4" style={{ color: "#03045E" }} />
            </button>
            <div
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1"
              data-testid={`result-card-dots-${p.slug}`}
            >
              {photos.slice(0, 5).map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-all"
                  style={{
                    backgroundColor:
                      i === safeIdx ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                    transform: i === safeIdx ? "scale(1.15)" : "scale(1)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                  }}
                />
              ))}
              {photos.length > 5 && (
                <span
                  className="text-[10px] font-semibold text-white ml-1"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                >
                  +{photos.length - 5}
                </span>
              )}
            </div>
          </>
        )}

        {/* Top-left overlay: Verified */}
        {p.verification_status === "approved" && (
          <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/95 shadow-sm" style={{ color: "#03045E" }}>
            <ShieldCheck className="w-3 h-3" />
            {t("provider.verified")}
          </div>
        )}

        {/* Top-right overlay: Video + Save heart */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {p.video_url && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white shadow-sm"
              style={{ backgroundColor: "rgba(3, 4, 94, 0.92)" }}
              data-testid={`card-video-badge-${p.slug}`}
            >
              <Video className="w-3 h-3" /> Video
            </span>
          )}
          {/* Section 75 — Save-to-shortlist heart (Airbnb-style). */}
          {onToggleSave && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave(p.provider_id);
              }}
              aria-pressed={isSaved}
              aria-label={
                isSaved
                  ? (lang === "en" ? "Remove from saved" : "Quitar de guardados")
                  : (lang === "en" ? "Save provider" : "Guardar proveedor")
              }
              className="w-9 h-9 rounded-full bg-white/95 shadow-md flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              data-testid={`card-save-btn-${p.slug}`}
              data-saved={isSaved ? "true" : "false"}
            >
              <Bookmark
                className="w-4 h-4 transition-colors"
                fill={isSaved ? "#EF4444" : "none"}
                stroke={isSaved ? "#EF4444" : "#03045E"}
                strokeWidth={2}
              />
            </button>
          )}
        </div>

        {/* Bottom-left overlay: Owner identity */}
        {p.owner_identity && (
          <div className="absolute bottom-3 left-3">
            <OwnerIdentityBadge identity={p.owner_identity} size="sm" />
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5">
        {/* Title row + rating */}
        <div className="flex items-start justify-between gap-3">
          <h3
            className="font-display font-semibold text-base sm:text-[17px] leading-tight line-clamp-2"
            style={{ color: "#03045E" }}
          >
            {p.business_name}
          </h3>
          {reviewCount > 0 ? (
            <div
              className="flex items-center gap-1 text-sm font-semibold flex-shrink-0"
              style={{ color: "#03045E" }}
              data-testid={`result-card-rating-${p.slug}`}
            >
              <Star className="w-4 h-4 fill-current" style={{ color: "#F59E0B" }} />
              <span>{ratingNum.toFixed(1)}</span>
              <span className="text-slate-500 font-normal text-xs">
                ({reviewCount})
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">
              {lang === "en" ? "New" : "Nuevo"}
            </span>
          )}
        </div>

        {/* Section 89 v4 — Trust Score tile next to the title. The
            backend already attaches portfolio_count / referrals_converted
            / days_active so the score is meaningful on the list view. */}
        <div className="mt-1.5">
          <TrustScore profile={p} variant="tile" />
        </div>

        {/* Category + city row */}
        <div className="mt-2 flex items-center flex-wrap gap-2 text-xs">
          {p.category && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `${p.category.color || "#0077B6"}15`,
                color: p.category.color || "#0077B6",
              }}
            >
              <CategoryIcon
                slug={p.category.slug}
                size={12}
                color={p.category.color || "#0077B6"}
                stroke={2.2}
              />
              {lang === "es" ? p.category.name_es : p.category.name_en}
            </span>
          )}
          <span className="text-slate-500 inline-flex items-center gap-1">
            {p.city}
            {p.state ? `, ${p.state}` : ""}
          </span>
          {typeof p.distance_miles === "number" && p.distance_miles < 9999 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E0F2F1", color: "#03045E" }}
              data-testid={`distance-badge-${p.slug}`}
            >
              <Navigation className="w-2.5 h-2.5" />
              {p.distance_miles.toFixed(1)} mi
            </span>
          )}
        </div>

        {/* Description */}
        {p.description && (
          <p className="text-sm text-slate-600 mt-3 line-clamp-2 leading-relaxed">
            {p.description}
          </p>
        )}

        {/* Services chips */}
        {services.length > 0 && (
          <div
            className="mt-3 flex flex-wrap gap-1.5"
            data-testid={`result-card-services-${p.slug}`}
          >
            {services.map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="inline-block text-[11px] px-2 py-0.5 rounded-md border bg-white truncate max-w-[140px]"
                style={{ borderColor: "#CAF0F8", color: "#03045E" }}
                title={s}
              >
                {s}
              </span>
            ))}
            {extraServices > 0 && (
              <span
                className="inline-block text-[11px] px-2 py-0.5 rounded-md font-medium"
                style={{ backgroundColor: "#CAF0F8", color: "#03045E" }}
              >
                +{extraServices}
              </span>
            )}
          </div>
        )}

        {/* Stats footer */}
        <div
          className="mt-3 pt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 border-t border-slate-100"
          data-testid={`result-card-stats-${p.slug}`}
        >
          {likes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart
                className="w-3.5 h-3.5 fill-current"
                style={{ color: "#EF4444" }}
              />
              <span className="font-semibold" style={{ color: "#475569" }}>
                {likes}
              </span>
              {lang === "en" ? "likes" : "me gusta"}
            </span>
          )}
          {views > 0 && (
            <span className="inline-flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span className="font-semibold" style={{ color: "#475569" }}>
                {views}
              </span>
              {lang === "en" ? "views" : "vistas"}
            </span>
          )}
          {reviewCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="font-semibold" style={{ color: "#475569" }}>
                {reviewCount}
              </span>
              {lang === "en"
                ? reviewCount === 1
                  ? "review"
                  : "reviews"
                : reviewCount === 1
                ? "reseña"
                : "reseñas"}
            </span>
          )}
          {fastResponder && (
            <span
              className="inline-flex items-center gap-1 font-semibold ml-auto"
              style={{ color: "#0077B6" }}
              data-testid={`result-card-fast-${p.slug}`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              {lang === "en" ? "Quick reply" : "Responde rápido"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
