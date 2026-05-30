import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Sparkles, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import TrustScore, { calcTrustScore } from "./TrustScore";
import { buildFileUrl } from "./ImageUpload";
import VerifiedBadge from "./VerifiedBadge";

/**
 * BarrioOverlay — Section 89 v4 unified.
 *
 * Renders three pieces of "Barrio" chrome that wrap the unified Feed:
 *   1. `<BarrioHeader>`     — city chip + 5-radius selector
 *   2. `<FeaturedStrip>`    — horizontal carousel of featured providers
 *   3. `<InlineTrustCard>`  — gentle nudge for the current provider
 *
 * The pieces are exported individually so the host page (ComunidadPage)
 * can interleave them with its existing PostFeed without duplicating
 * the feed logic. `useBarrioContext` returns the current `{city, state,
 * radius, myProfile}` so the host can filter posts client-side.
 */

const RADIUS_OPTIONS = [10, 25, 50, 100, 160];
const DEFAULT_RADIUS = 50;
const STORAGE_KEY = "barrio_radius";

function loadRadius() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = parseInt(raw, 10);
    if (RADIUS_OPTIONS.includes(n)) return n;
  } catch { /* noop */ }
  return DEFAULT_RADIUS;
}
function saveRadius(n) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* noop */ }
}

/**
 * Hook the host calls to drive Barrio mode. Returns
 *   { city, state, radius, setRadius, myProfile, featured, featuredLoading }
 * so the host doesn't have to know about the API shape.
 */
export function useBarrio() {
  const { user } = useAuth();
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [radius, setRadiusState] = useState(loadRadius());
  const [myProfile, setMyProfile] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get("/providers/me").then(r => {
      if (!alive) return;
      const prof = r.data || null;
      setMyProfile(prof);
      if (prof?.city) setCity(prof.city);
      if (prof?.state) setState(prof.state);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    let alive = true;
    setFeaturedLoading(true);
    const params = { limit: 12 };
    if (city) params.city = city;
    // Section 89 v4 Phase F — Read from the curated weekly pool first.
    // The endpoint transparently falls back to a generic top list when
    // the pool is empty for the current ISO week.
    api.get("/providers/featured", { params }).then(r => {
      if (!alive) return;
      setFeatured((r.data || []).slice(0, 8));
      setFeaturedLoading(false);
    }).catch(() => { if (alive) setFeaturedLoading(false); });
    return () => { alive = false; };
  }, [city, state]);

  const setRadius = (n) => { setRadiusState(n); saveRadius(n); };

  return { city, state, radius, setRadius, myProfile, featured, featuredLoading };
}

export function BarrioHeader({ city, state, radius, onRadiusChange }) {
  const { lang } = useI18n();
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3.5 mb-3" data-testid="barrio-header">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-display font-extrabold text-lg text-[#03045E] mr-1">
          {lang === "en" ? "Neighborhood" : "Barrio"}
        </h1>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-[#F0F9FF] border border-[#90E0EF] text-xs font-semibold text-[#0077B6]"
          data-testid="barrio-city-chip"
        >
          <MapPin className="w-3.5 h-3.5" />
          {city ? `${city}${state ? `, ${state}` : ""}` : (lang === "en" ? "Anywhere in the US" : "Toda EE.UU.")}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1" data-testid="barrio-radius-chips">
        {RADIUS_OPTIONS.map((mi) => {
          const active = mi === radius;
          return (
            <button
              key={mi}
              type="button"
              onClick={() => onRadiusChange(mi)}
              className={`flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold transition ${
                active
                  ? "bg-[#0077B6] text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:border-[#0077B6]"
              }`}
              data-testid={`barrio-radius-${mi}`}
              aria-pressed={active}
            >
              {mi} mi
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FeaturedStrip({ providers, loading, city }) {
  const { lang } = useI18n();
  if (loading) {
    return (
      <div className="mb-4 flex gap-3 overflow-x-auto scrollbar-none px-1 -mx-1" data-testid="barrio-featured-loading">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-44 h-32 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!providers.length) return null;
  return (
    <section className="mb-4" data-testid="barrio-featured-strip">
      <header className="flex items-end justify-between mb-2 px-1">
        <h2 className="text-[12px] uppercase tracking-widest font-bold text-[#03045E] inline-flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          {lang === "en" ? "Featured this week" : "Destacados esta semana"}
        </h2>
        {city && <span className="text-[11px] font-medium text-slate-500">{city}</span>}
      </header>
      <div className="flex gap-3 overflow-x-auto scrollbar-none px-1 -mx-1 pb-1">
        {providers.map(p => (
          <Link
            key={p.provider_id}
            to={`/p/${p.slug}`}
            className="flex-shrink-0 w-44 rounded-2xl bg-white border border-slate-200 hover:border-[#0077B6] hover:shadow-md transition overflow-hidden"
            data-testid={`barrio-featured-${p.slug}`}
          >
            <div className="h-20 bg-gradient-to-br from-[#CAF0F8] to-[#90E0EF] relative">
              {p.cover_url && (
                <img src={buildFileUrl(p.cover_url)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              )}
              {p.provider_verified && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-white/95 text-[#03045E] text-[9px] font-bold shadow-sm">
                  <VerifiedBadge size={10} />
                  {lang === "en" ? "Verified" : "Verificado"}
                </span>
              )}
            </div>
            <div className="px-2.5 py-2">
              <p className="font-semibold text-[13px] text-[#03045E] truncate">{p.business_name}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {p.category?.[lang === "en" ? "name_en" : "name_es"] || ""}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <TrustScore profile={p} variant="tile" />
                {p.getamano_code && (
                  <span className="font-mono text-[10px] font-bold text-slate-500">{p.getamano_code}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function InlineTrustCard({ profile }) {
  const { lang } = useI18n();
  const score = useMemo(() => calcTrustScore(profile), [profile]);
  if (score === null) return null;
  const nextStep = !profile.provider_verified
    ? (lang === "en" ? "Verify your profile to unlock badge ✓" : "Verifícate y desbloquea tu ✓")
    : (profile.portfolio_count || 0) < 5
      ? (lang === "en" ? "Add 5 portfolio photos to keep growing" : "Suma 5 fotos al portafolio")
      : (profile.reviews_count || 0) < 3
        ? (lang === "en" ? "Ask 3 clients for a review" : "Pide 3 reseñas a tus clientes")
        : (lang === "en" ? "Keep showing up — small steps win" : "Sigue activo cada semana — la constancia gana");
  return (
    <div className="rounded-2xl border border-[#90E0EF] bg-gradient-to-br from-white to-[#F0F9FF] p-4 sm:p-5 my-3" data-testid="barrio-inline-trust">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] uppercase tracking-widest font-bold text-[#0077B6]">
          {lang === "en" ? "Your trust score" : "Tu Trust Score"}
        </span>
        <TrustScore profile={profile} variant="tile" />
      </div>
      <p className="text-sm text-slate-700 leading-snug">
        <strong className="font-bold text-[#03045E]">{score}/100.</strong>{" "}
        {nextStep}
      </p>
      <Link
        to="/dashboard/provider"
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#0077B6] hover:underline"
        data-testid="barrio-inline-trust-cta"
      >
        {lang === "en" ? "Open dashboard" : "Abrir panel"} →
      </Link>
    </div>
  );
}

export const barrioCityFilter = (posts, city) => {
  if (!city) return posts;
  const cityLower = city.toLowerCase();
  const local = posts.filter(p => ((p.author?.city) || "").toLowerCase() === cityLower);
  // Soft fallback: never starve users when their city has no posts yet.
  return local.length ? local : posts;
};
