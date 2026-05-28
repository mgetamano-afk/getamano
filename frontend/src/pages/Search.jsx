import { useEffect, useState, useRef, useCallback, createElement } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { Search as SearchIcon, MapPin, Star, ShieldCheck, Filter, List, Map as MapIcon, LayoutPanelLeft, Video, Navigation, X } from "lucide-react";
import CategoryIcon from "../components/CategoryIcon";
import OwnerIdentityBadge from "../components/OwnerIdentityBadge";
import ProvidersMap from "../components/ProvidersMap";
import CitySearchInput from "../components/CitySearchInput";
import SmartSearchEmptyState from "../components/SmartSearchEmptyState";
import CategoryTreePicker from "../components/CategoryTreePicker";
import useGeolocation from "../hooks/useGeolocation";
import useRefreshable from "../hooks/useRefreshable";
import { trackSearch } from "../lib/analytics";
import { MAIN_CATEGORIES } from "../data/categoryMap";
import { SeoHead } from "../components/seo/SeoHead";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { t, lang } = useI18n();
  const [q, setQ] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [verifiedOnly, setVerifiedOnly] = useState(params.get("verified") === "true");
  const [language, setLanguage] = useState(params.get("language") || "");
  const [hasVideo, setHasVideo] = useState(params.get("has_video") === "true");
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const { position, loading: geoLoading, requestLocation, clear: clearGeo } = useGeolocation();
  const [radiusMiles, setRadiusMiles] = useState(() => {
    const r = parseInt(params.get("radius_miles") || "", 10);
    return Number.isFinite(r) && r > 0 ? r : 75;
  });
  const [stuck, setStuck] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false); // Section 79
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

  // Hero "Cerca de mí" handoff — Landing pushes ?nearme=1 here and we fire
  // requestLocation() so the browser permission prompt appears on the
  // page that actually needs it. Strip the flag after consuming it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (params.get("nearme") !== "1") return;
    requestLocation();
    const next = new URLSearchParams(params);
    next.delete("nearme");
    setParams(next, { replace: true });
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
    const cur = { q, city, category, verifiedOnly, language, hasVideo, ...overrides };
    if (cur.q) qs.q = cur.q;
    if (cur.city) qs.city = cur.city;
    if (cur.category) qs.category = cur.category;
    if (cur.verifiedOnly) qs.verified = "true";
    if (cur.language) qs.language = cur.language;
    if (cur.hasVideo) qs.has_video = "true";
    // Section 18F — proximity ("Near me") — US default radius: 75 miles (~1.5h drive)
    if (position && !cur.city) {
      qs.lat = position.lat;
      qs.lng = position.lng;
      qs.radius_miles = cur.radiusMiles || radiusMiles;
    }
    const urlQs = { ...qs };
    if (view !== "list") urlQs.view = view;
    setParams(urlQs);
    try {
      const { data } = await api.get("/providers", { params: qs });
      setProviders(data);
      trackSearch(cur.q, cur.city, cur.category, (data || []).length);
    } finally {
      setLoading(false);
    }
  };

  // Fetch map data progressively (geocodes up to 5 per call server-side; we call up to 6 times)
  const fetchMap = async (overrides = {}, bbox = null) => {
    const qs = {};
    const cur = { q, city, category, verifiedOnly, language, hasVideo, ...overrides };
    if (cur.q) qs.q = cur.q;
    if (cur.city) qs.city = cur.city;
    if (cur.category) qs.category = cur.category;
    if (cur.verifiedOnly) qs.verified = "true";
    if (cur.language) qs.language = cur.language;
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

  // Section 75 — pull-to-refresh: re-run the current search with no overrides.
  // doSearch() reads from state, so the latest filter set is used.
  const refresh = useCallback(() => {
    return doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, city, category, verifiedOnly, language, hasVideo, position?.lat, position?.lng, radiusMiles, view]);
  useRefreshable(refresh);

  // Section 18F — auto-research when user enables "Near me"
  useEffect(() => {
    if (position) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F6F2" }}>
      <SeoHead
        title={lang === "en" ? "Search service pros" : "Buscar profesionales"}
        description={lang === "en"
          ? "Find verified service professionals near you — plumbers, electricians, cleaning, landscaping & more."
          : "Encuentra profesionales verificados cerca de ti — plomeros, electricistas, limpieza, jardinería y más."}
        lang={lang}
      />
      <Header />
      {/* Sentinel to detect when the sticky filter bar becomes stuck */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

      {/* Search filter bar. On mobile (sm and below) this scrolls
          naturally with the page — sticky was trapping touch and
          forcing the section to lock at mid-screen on iOS. On md+
          screens it sticks below the header for quick filter access
          while browsing long result lists. */}
      <div
        className="md:sticky md:top-20 z-30 transition-all duration-200"
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
            <div className="flex items-center gap-2 px-3 md:border-l border-slate-200 md:max-w-[280px] flex-1 md:flex-initial">
              <div className="flex-1 min-w-0">
                <CitySearchInput
                  value={city}
                  onChange={(c, _stateName, stateAbbr) => {
                    const display = c && stateAbbr ? `${c}, ${stateAbbr}` : c || "";
                    setCity(display);
                    clearGeo();
                  }}
                  placeholder={t("hero.search.location")}
                  compact
                  onUseGeolocation={() => { setCity(""); requestLocation(); }}
                  geoActive={Boolean(position)}
                  geoLoading={geoLoading}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" data-testid="search-submit">{t("hero.search.cta")}</button>
          </form>

          {/* Section 79 — Hierarchical service picker (mobile-first).
              Tap → opens a bottom-sheet with sector → subcategory navigation
              and full-text search across all 188 services. Replaces the old
              16-option dropdown that was desktop-only. */}
          <div className="-mt-2 mb-4 flex items-center gap-2 flex-wrap" data-testid="category-picker-row">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-slate-200 shadow-sm hover:border-teal-400 hover:shadow transition text-sm font-medium text-slate-700"
              data-testid="open-category-picker"
            >
              {(() => {
                const cat = categories.find(c => c.slug === category);
                if (cat) {
                  return (
                    <>
                      <span className="text-base leading-none">{cat.emoji || "🛠️"}</span>
                      <span className="truncate max-w-[200px]">{lang === "en" ? cat.name_en : cat.name_es}</span>
                    </>
                  );
                }
                return (
                  <>
                    <span className="text-base leading-none">🧭</span>
                    <span>{lang === "en" ? "What service?" : "¿Qué servicio?"}</span>
                  </>
                );
              })()}
            </button>
            {category && (
              <button
                type="button"
                onClick={() => { setCategory(""); setTimeout(() => doSearch(), 0); }}
                className="inline-flex items-center gap-1 h-10 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs text-slate-600 transition"
                data-testid="clear-category"
                aria-label={lang === "en" ? "Clear category" : "Quitar categoría"}
              >
                <X className="w-3.5 h-3.5" /> {lang === "en" ? "Clear" : "Quitar"}
              </button>
            )}
          </div>

          {/* Section 18F — Radius selector (only when "Near me" is active) */}
          {position && (
            <div className="mb-4 flex items-center gap-2 flex-wrap bg-teal-50/60 border border-teal-100 rounded-2xl px-3 py-2.5" data-testid="radius-selector">
              <Navigation className="w-4 h-4 flex-shrink-0" style={{ color: "#025F67" }} />
              <span className="text-xs font-medium text-slate-700">
                {lang === "en" ? "Within:" : "Radio:"}
              </span>
              {[10, 25, 50, 75, 150, 300].map(r => {
                const active = radiusMiles === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRadiusMiles(r);
                      doSearch(null, { radiusMiles: r });
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${active ? "text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
                    style={active ? { backgroundColor: "#025F67" } : {}}
                    data-testid={`radius-chip-${r}`}
                    aria-pressed={active}
                  >
                    {r} mi
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => { clearGeo(); doSearch(null, { city: "" }); }}
                className="ml-auto text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
                title={lang === "en" ? "Clear location" : "Quitar ubicación"}
                data-testid="radius-clear"
              >
                <X className="w-3 h-3" /> {lang === "en" ? "Clear" : "Quitar"}
              </button>
            </div>
          )}

          {/* Inclusive filters: Video only. Identity filters removed in
              Section 76 — getamano now serves all of America without
              segmenting by owner ethnicity (per Section 67 dual-audience). */}
          <div className="flex flex-wrap items-center gap-2" data-testid="filter-chips">
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
                            <Link to={`/provider/${p.slug}`} onClick={e => e.stopPropagation()} className="font-display font-semibold text-base truncate hover:underline" style={{ color: "#025F67" }}>{p.business_name}</Link>
                            {p.rating_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-semibold flex-shrink-0" style={{ color: "#063154" }}>
                                <Star className="w-3.5 h-3.5 fill-current" style={{ color: "#F59E0B" }} /> {Number(p.rating_avg).toFixed(1)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {p.city}{p.state ? `, ${p.state}` : ""}
                            {typeof p.distance_miles === "number" && p.distance_miles < 9999 && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#E0F2F1", color: "#025F67" }} data-testid={`distance-badge-split-${p.slug}`}>
                                <Navigation className="w-2.5 h-2.5" /> {p.distance_miles.toFixed(1)} mi
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
                  userPosition={position}
                  radiusMiles={position ? radiusMiles : null}
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
                  {categories
                    .filter(c => MAIN_CATEGORIES.includes(c.name_es))
                    .sort((a, b) => MAIN_CATEGORIES.indexOf(a.name_es) - MAIN_CATEGORIES.indexOf(b.name_es))
                    .map(c => createElement("option", { key: c.category_id, value: c.slug }, lang === "es" ? c.name_es : c.name_en))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">{t("filter.language")}</label>
                <select value={language} onChange={e => { setLanguage(e.target.value); setTimeout(() => doSearch(), 0); }} className="w-full h-10 px-3 rounded-xl border border-slate-200" data-testid="filter-language-select">
                  <option value="">{lang === "en" ? "Any" : "Cualquiera"}</option>
                  <option value="es">🇲🇽 {lang === "en" ? "Spanish" : "Español"}</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="pt">🇧🇷 {lang === "en" ? "Portuguese" : "Portugués"}</option>
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
                userPosition={position}
                radiusMiles={position ? radiusMiles : null}
              />
            ) : loading ? (
              <div className="text-center text-slate-500 py-12">{t("common.loading")}</div>
            ) : providers.length === 0 ? (
              <SmartSearchEmptyState
                q={q}
                city={city}
                onSuggestionClick={(label) => {
                  setQ(label);
                  // Re-run search by updating URL params so the existing
                  // effect re-fetches with the new term.
                  const next = new URLSearchParams(params);
                  next.set("q", label);
                  setParams(next);
                }}
              />
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {providers.map(p => (
                  <Link key={p.provider_id} to={`/provider/${p.slug}`} className="card-lift bg-white rounded-2xl border border-slate-200 overflow-hidden block" data-testid={`result-card-${p.slug}`}>
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
                            {typeof p.distance_miles === "number" && p.distance_miles < 9999 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#E0F2F1", color: "#025F67" }} data-testid={`distance-badge-${p.slug}`}>
                                <Navigation className="w-2.5 h-2.5" /> {p.distance_miles.toFixed(1)} {lang === "en" ? "mi" : "mi"}
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

      <CategoryTreePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={category}
        onSelect={(sub) => {
          setCategory(sub.slug);
          setTimeout(() => doSearch(null, {}), 0);
        }}
      />
    </div>
  );
}
