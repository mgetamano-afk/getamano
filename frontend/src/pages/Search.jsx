import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { Search as SearchIcon, MapPin, Star, ShieldCheck, Filter, List, Map as MapIcon, LayoutPanelLeft, Video, Navigation, Loader2 } from "lucide-react";
import CategoryIcon from "../components/CategoryIcon";
import OwnerIdentityBadge from "../components/OwnerIdentityBadge";
import ProvidersMap from "../components/ProvidersMap";
import CityAutocomplete from "../components/CityAutocomplete";
import useGeolocation from "../hooks/useGeolocation";
import { trackSearch } from "../lib/analytics";

const IDENTITY_CHIPS = [
  { id: "", label: "Todos" },
  { id: "latino", label: "Dueños Latinos", emoji: "🤝" },
  { id: "american", label: "Dueños Americanos", emoji: "🤝" },
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { t, lang } = useI18n();
  const [q, setQ] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [verifiedOnly, setVerifiedOnly] = useState(params.get("verified") === "true");
  const [language, setLanguage] = useState(params.get("language") || "");
  const [ownerIdentity, setOwnerIdentity] = useState(params.get("owner_identity") || "");
  const [hasVideo, setHasVideo] = useState(params.get("has_video") === "true");
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const { position, loading: geoLoading, requestLocation, clear: clearGeo } = useGeolocation();
  const [identityCounts, setIdentityCounts] = useState({ all: 0, latino: 0, american: 0 });
  const [stuck, setStuck] = useState(false);
  const [view, setView] = useState(() => {
    const v = params.get("view");
    return v === "map" || v === "split" ? v : "list";
  });
  const [mapProviders, setMapProviders] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const sentinelRef = useRef(null);
  const listCardRefs = useRef({});

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // Mount-only: sentinelRef.current is set by React before this fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get("/categories").then(r => setCategories(r.data));
    // Mount-only: load categories once. `api` is a module singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = async (e, overrides = {}) => {
    if (e) e.preventDefault();
    setLoading(true);
    const qs = {};
    const cur = { q, city, category, verifiedOnly, language, ownerIdentity, hasVideo, ...overrides };
    if (cur.q) qs.q = cur.q;
    if (cur.city) qs.city = cur.city;
    if (cur.category) qs.category = cur.category;
    if (cur.verifiedOnly) qs.verified = "true";
    if (cur.language) qs.language = cur.language;
    if (cur.ownerIdentity) qs.owner_identity = cur.ownerIdentity;
    if (cur.hasVideo) qs.has_video = "true";
    // Section 18F — proximity ("Near me") search
    if (position && !cur.city) {
      qs.lat = position.lat;
      qs.lng = position.lng;
      qs.radius_km = 50;
    }
    const urlQs = { ...qs };
    if (view !== "list") urlQs.view = view;
    setParams(urlQs);
    // counts query: same filters minus owner_identity
    const countsQs = { ...qs };
    delete countsQs.owner_identity;
    try {
      const [{ data }, countsRes] = await Promise.all([
        api.get("/providers", { params: qs }),
        api.get("/providers/identity-counts", { params: countsQs }).catch(() => ({ data: null })),
      ]);
      setProviders(data);
      if (countsRes?.data) setIdentityCounts(countsRes.data);
      trackSearch(cur.q, cur.city, cur.category, (data || []).length);
    } finally {
      setLoading(false);
    }
  };

  // Fetch map data progressively (geocodes up to 5 per call server-side; we call up to 6 times)
  const fetchMap = async (overrides = {}, bbox = null) => {
    const qs = {};
    const cur = { q, city, category, verifiedOnly, language, ownerIdentity, hasVideo, ...overrides };
    if (cur.q) qs.q = cur.q;
    if (cur.city) qs.city = cur.city;
    if (cur.category) qs.category = cur.category;
    if (cur.verifiedOnly) qs.verified = "true";
    if (cur.language) qs.language = cur.language;
    if (cur.ownerIdentity) qs.owner_identity = cur.ownerIdentity;
    if (cur.hasVideo) qs.has_video = "true";
    if (bbox) {
      qs.min_lat = bbox.min_lat;
      qs.max_lat = bbox.max_lat;
      qs.min_lng = bbox.min_lng;
      qs.max_lng = bbox.max_lng;
    }
    setMapLoading(true);
    try {
      // With bbox: single call (no progressive geocoding). Without bbox: up to 6 calls
      const maxAttempts = bbox ? 1 : 6;
      let attempt = 0;
      let lastItems = [];
      let lastMatched = 0;
      while (attempt < maxAttempts) {
        const { data } = await api.get("/providers/map", { params: qs });
        lastItems = data.items || [];
        lastMatched = data.total_matched || 0;
        setMapProviders(lastItems);
        if (lastItems.length >= lastMatched || data.geocoded_this_call === 0) break;
        attempt += 1;
      }
    } finally {
      setMapLoading(false);
    }
  };

  const handleSearchArea = (bbox) => {
    fetchMap({}, bbox);
  };

  useEffect(() => {
    if (view === "map" || view === "split") {
      fetchMap();
    }
    // eslint-disable-next-line
  }, [view]);

  // When marker is clicked from map, scroll the matching list card into view (split mode)
  const handleMarkerClick = (providerId) => {
    setHighlightedId(providerId);
    if (view === "split") {
      const el = listCardRefs.current[providerId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => { doSearch(); /* eslint-disable-next-line */ }, []);

  // Section 18F — auto-research when user enables "Near me"
  useEffect(() => {
    if (position) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);

  const selectIdentity = (id) => {
    setOwnerIdentity(id);
    doSearch(null, { ownerIdentity: id });
    if (view === "map" || view === "split") fetchMap({ ownerIdentity: id });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <Header />
      {/* Sentinel to detect when the sticky filter bar becomes stuck */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

      {/* Sticky filter bar: search form + identity chips */}
      <div
        className="sticky top-16 md:top-20 z-30 transition-all duration-200"
        style={{
          backgroundColor: stuck ? "rgba(247, 246, 242, 0.92)" : "transparent",
          backdropFilter: stuck ? "blur(14px)" : "none",
          WebkitBackdropFilter: stuck ? "blur(14px)" : "none",
          boxShadow: stuck ? "0 4px 16px -8px rgba(6, 49, 84, 0.12)" : "none",
          borderBottom: stuck ? "1px solid rgba(188, 197, 204, 0.4)" : "1px solid transparent",
        }}
        data-testid="search-sticky-bar"
        data-stuck={stuck}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 pb-4">
          <form onSubmit={doSearch} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 flex flex-col md:flex-row gap-2 mb-4" data-testid="search-form">
            <div className="flex items-center gap-2 px-3 flex-1">
              <SearchIcon className="w-5 h-5 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("hero.search.placeholder")} className="w-full py-3 outline-none bg-transparent" data-testid="search-q-input" />
            </div>
            <div className="flex items-center gap-2 px-3 md:border-l border-slate-200 md:max-w-[260px] flex-1 md:flex-initial">
              <div className="flex-1 min-w-0">
                <CityAutocomplete
                  value={city}
                  onSelect={({ displayName }) => { setCity(displayName); clearGeo(); }}
                  placeholder={t("hero.search.location")}
                  testid="search-city-input"
                />
              </div>
              <button
                type="button"
                onClick={() => { setCity(""); requestLocation(); }}
                className={`flex-shrink-0 p-2.5 rounded-xl border transition ${position ? "bg-teal-600 text-white border-teal-600" : "bg-white text-teal-700 border-slate-200 hover:border-teal-500"}`}
                title={position ? "Ubicación activa" : (lang === "en" ? "Near me" : "Cerca de mí")}
                data-testid="search-near-me"
                disabled={geoLoading}
              >
                {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              </button>
            </div>
            <button type="submit" className="btn-primary" data-testid="search-submit">{t("hero.search.cta")}</button>
          </form>

          {/* Identity chips (inclusive filter, no flags) */}
          <div className="flex flex-wrap items-center gap-2" data-testid="identity-filter-chips">
          {IDENTITY_CHIPS.map(chip => {
            const active = ownerIdentity === chip.id;
            const countKey = chip.id || "all";
            const count = identityCounts[countKey] ?? 0;
            return (
              <button
                key={chip.id || "all"}
                type="button"
                onClick={() => selectIdentity(chip.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${active ? "shadow-sm" : "hover:border-slate-300"}`}
                style={{
                  backgroundColor: active ? "#025F67" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#025F67",
                  borderColor: active ? "#025F67" : "#BCC5CC",
                }}
                data-testid={`identity-chip-${chip.id || "all"}`}
                aria-pressed={active}
              >
                {chip.emoji && <span aria-hidden="true">{chip.emoji}</span>}
                {chip.label}
                <span
                  className="ml-1 inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums"
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.22)" : "#EBF8F7",
                    color: active ? "#FFFFFF" : "#025F67",
                  }}
                  data-testid={`identity-chip-count-${chip.id || "all"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Video filter chip */}
          <button
            type="button"
            onClick={() => {
              const next = !hasVideo;
              setHasVideo(next);
              doSearch(null, { hasVideo: next });
              if (view === "map" || view === "split") fetchMap({ hasVideo: next });
            }}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border"
            style={{
              backgroundColor: hasVideo ? "#025F67" : "#FFFFFF",
              color: hasVideo ? "#FFFFFF" : "#025F67",
              borderColor: hasVideo ? "#025F67" : "#BCC5CC",
            }}
            data-testid="filter-has-video"
            aria-pressed={hasVideo}
            title="Solo proveedores con video de presentación"
          >
            <Video className="w-3.5 h-3.5" />
            Con video
          </button>

          {/* View toggle: Lista | Split | Mapa */}
          <div className="ml-auto inline-flex items-center rounded-full border overflow-hidden" style={{ borderColor: "#BCC5CC", backgroundColor: "#FFFFFF" }} data-testid="view-toggle">
            <button
              type="button"
              onClick={() => setView("list")}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition"
              style={{ backgroundColor: view === "list" ? "#025F67" : "transparent", color: view === "list" ? "#FFFFFF" : "#025F67" }}
              data-testid="view-toggle-list"
              aria-pressed={view === "list"}
            >
              <List className="w-4 h-4" /> Lista
            </button>
            <button
              type="button"
              onClick={() => setView("split")}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition border-l border-r"
              style={{ backgroundColor: view === "split" ? "#025F67" : "transparent", color: view === "split" ? "#FFFFFF" : "#025F67", borderColor: "#BCC5CC" }}
              data-testid="view-toggle-split"
              aria-pressed={view === "split"}
            >
              <LayoutPanelLeft className="w-4 h-4" /> Split
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition"
              style={{ backgroundColor: view === "map" ? "#025F67" : "transparent", color: view === "map" ? "#FFFFFF" : "#025F67" }}
              data-testid="view-toggle-map"
              aria-pressed={view === "map"}
            >
              <MapIcon className="w-4 h-4" /> Mapa
            </button>
          </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-12">
        {view === "split" ? (
          /* SPLIT VIEW: list on left, sticky map on right (desktop only) */
          <div data-testid="split-view">
            <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: "#025F67" }}>
              {t("search.results")} <span className="text-slate-400 text-base font-normal">({mapProviders.length})</span>
            </h2>
            <div className="grid lg:grid-cols-2 gap-5">
              {/* List column */}
              <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1 lg:pr-3" data-testid="split-list-column">
                {mapLoading && mapProviders.length === 0 && (
                  <div className="text-center text-slate-500 py-12">{t("common.loading")}</div>
                )}
                {!mapLoading && mapProviders.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">{t("search.no_results")}</div>
                )}
                {mapProviders.map(p => {
                  const isHighlighted = highlightedId === p.provider_id;
                  return (
                    <div
                      key={p.provider_id}
                      ref={el => { if (el) listCardRefs.current[p.provider_id] = el; }}
                      onMouseEnter={() => setHighlightedId(p.provider_id)}
                      onMouseLeave={() => setHighlightedId(null)}
                      onClick={() => handleMarkerClick(p.provider_id)}
                      className="card-lift bg-white rounded-2xl border overflow-hidden cursor-pointer transition-all"
                      style={{
                        borderColor: isHighlighted ? "#2F9D94" : "#E2E8F0",
                        boxShadow: isHighlighted ? "0 8px 24px -8px rgba(47,157,148,0.35)" : undefined,
                        transform: isHighlighted ? "translateY(-2px)" : undefined,
                      }}
                      data-testid={`split-card-${p.slug}`}
                      data-highlighted={isHighlighted}
                    >
                      <div className="flex">
                        <div className="w-28 h-28 bg-slate-100 flex-shrink-0 relative">
                          {p.cover_url && <img src={p.cover_url} alt={p.business_name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 p-4 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <Link to={`/services/${p.slug}`} onClick={e => e.stopPropagation()} className="font-display font-semibold text-base truncate hover:underline" style={{ color: "#025F67" }}>{p.business_name}</Link>
                            {p.rating_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-semibold flex-shrink-0" style={{ color: "#063154" }}>
                                <Star className="w-3.5 h-3.5 fill-current" style={{ color: "#F59E0B" }} /> {Number(p.rating_avg).toFixed(1)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {p.city}{p.state ? `, ${p.state}` : ""}
                            {typeof p.distance_km === "number" && p.distance_km < 9999 && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#E0F2F1", color: "#025F67" }} data-testid={`distance-badge-${p.slug}`}>
                                <Navigation className="w-2.5 h-2.5" /> {p.distance_km.toFixed(1)} km
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {p.verified && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EBF8F7", color: "#025F67", border: "1px solid #A6E1DA" }}>
                                <ShieldCheck className="w-2.5 h-2.5" /> Verificado
                              </span>
                            )}
                            {p.video_url && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: "#025F67" }} data-testid={`split-video-badge-${p.slug}`}>
                                <Video className="w-2.5 h-2.5" /> Video
                              </span>
                            )}
                            <OwnerIdentityBadge identity={p.owner_identity} size="sm" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Map column (sticky) */}
              <div className="lg:sticky lg:top-[160px] h-fit" data-testid="split-map-column">
                <ProvidersMap
                  providers={mapProviders}
                  loading={mapLoading}
                  highlightedId={highlightedId}
                  onMarkerHover={setHighlightedId}
                  onMarkerClick={handleMarkerClick}
                  onSearchArea={handleSearchArea}
                />
              </div>
            </div>
          </div>
        ) : (
          /* LIST or MAP-only view */
          <div className="grid lg:grid-cols-[260px_1fr] gap-6">
          {/* Filters */}
          <aside className="bg-white rounded-2xl border border-slate-200 p-5 h-fit" data-testid="search-filters">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-slate-500" />
              <h3 className="font-display font-semibold text-slate-900">{t("search.filters")}</h3>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">{t("filter.category")}</label>
                <select value={category} onChange={e => { setCategory(e.target.value); setTimeout(() => doSearch(), 0); }} className="w-full h-10 px-3 rounded-xl border border-slate-200" data-testid="filter-category-select">
                  <option value="">Todas</option>
                  {categories.map(c => <option key={c.category_id} value={c.slug}>{lang === "es" ? c.name_es : c.name_en}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">{t("filter.language")}</label>
                <select value={language} onChange={e => { setLanguage(e.target.value); setTimeout(() => doSearch(), 0); }} className="w-full h-10 px-3 rounded-xl border border-slate-200" data-testid="filter-language-select">
                  <option value="">Cualquiera</option>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer" data-testid="filter-verified-label">
                <input type="checkbox" checked={verifiedOnly} onChange={e => { setVerifiedOnly(e.target.checked); setTimeout(() => doSearch(), 0); }} data-testid="filter-verified-checkbox" />
                <span className="text-sm text-slate-700">{t("filter.verified")}</span>
              </label>
            </div>
          </aside>

          {/* Results */}
          <div>
            <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: "#025F67" }} data-testid="search-results-title">
              {t("search.results")} <span className="text-slate-400 text-base font-normal">({providers.length})</span>
            </h2>
            {view === "map" ? (
              <ProvidersMap
                providers={mapProviders}
                loading={mapLoading}
                highlightedId={highlightedId}
                onMarkerHover={setHighlightedId}
                onMarkerClick={handleMarkerClick}
                onSearchArea={handleSearchArea}
              />
            ) : loading ? (
              <div className="text-center text-slate-500 py-12">{t("common.loading")}</div>
            ) : providers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500" data-testid="search-no-results">{t("search.no_results")}</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {providers.map(p => (
                  <Link key={p.provider_id} to={`/services/${p.slug}`} className="card-lift bg-white rounded-2xl border border-slate-200 overflow-hidden block" data-testid={`result-card-${p.slug}`}>
                    <div className="h-32 bg-slate-100 relative">
                      {p.cover_url && <img src={p.cover_url} alt={p.business_name} className="w-full h-full object-cover" />}
                      {p.verification_status === "approved" && (
                        <div className="absolute top-3 left-3 badge-verified"><ShieldCheck className="w-3.5 h-3.5" /> {t("provider.verified")}</div>
                      )}
                      {p.video_url && (
                        <div
                          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white shadow"
                          style={{ backgroundColor: "rgba(2, 95, 103, 0.92)" }}
                          data-testid={`card-video-badge-${p.slug}`}
                        >
                          <Video className="w-3 h-3" /> Video
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display font-semibold text-slate-900">{p.business_name}</h3>
                          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {p.city}{p.state ? `, ${p.state}` : ""}
                            {typeof p.distance_km === "number" && p.distance_km < 9999 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#E0F2F1", color: "#025F67" }} data-testid={`distance-badge-${p.slug}`}>
                                <Navigation className="w-2.5 h-2.5" /> {p.distance_km.toFixed(1)} km
                              </span>
                            )}
                          </p>
                        </div>
                        {p.rating_count > 0 && (
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Star className="w-4 h-4 fill-orange-500 text-orange-500" /> {p.rating_avg.toFixed(1)}
                          </div>
                        )}
                      </div>
                      {p.category && (
                        <span className="inline-flex items-center gap-1 mt-2 mr-2 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${p.category.color}15`, color: p.category.color }}>
                          <CategoryIcon slug={p.category.slug} size={14} color={p.category.color} stroke={2} />
                          {lang === "es" ? p.category.name_es : p.category.name_en}
                        </span>
                      )}
                      {p.owner_identity && <span className="inline-block mt-2"><OwnerIdentityBadge identity={p.owner_identity} size="sm" /></span>}
                      {p.description && <p className="text-sm text-slate-600 mt-3 line-clamp-2">{p.description}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
