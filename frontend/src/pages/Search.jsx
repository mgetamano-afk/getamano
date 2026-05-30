import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Search as SearchIcon, MapPin, Star, ShieldCheck, Filter, List, Map as MapIcon, LayoutPanelLeft, Video, Navigation, X, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CategoryIcon from "../components/CategoryIcon";
import OwnerIdentityBadge from "../components/OwnerIdentityBadge";
import SearchResultCard from "../components/SearchResultCard";
import ProvidersMap from "../components/ProvidersMap";
import CitySearchInput from "../components/CitySearchInput";
import SmartSearchEmptyState from "../components/SmartSearchEmptyState";
import CategoryTreePicker from "../components/CategoryTreePicker";
import LocationPrompt, { readSavedLocation, saveLocation, clearLocation } from "../components/LocationPrompt";
import VerifiedBadge from "../components/VerifiedBadge";
import useGeolocation from "../hooks/useGeolocation";
import useRefreshable from "../hooks/useRefreshable";
import { trackSearch } from "../lib/analytics";
import { SeoHead } from "../components/seo/SeoHead";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get("q") || "");
  const [city, setCity] = useState(() => {
    // Section 89 v7 Item 4 — Prefer the URL param; otherwise use the
    // saved city from the LocationPrompt. The prompt itself fires the
    // first time both are missing.
    const fromUrl = params.get("city");
    if (fromUrl) return fromUrl;
    const saved = readSavedLocation();
    return saved.city && saved.state ? `${saved.city}, ${saved.state}` : (saved.city || "");
  });
  const [locationPromptOpen, setLocationPromptOpen] = useState(() => {
    // Open exactly when no city is set anywhere and we haven't already
    // asked this session.
    if (params.get("city")) return false;
    const saved = readSavedLocation();
    if (saved.city) return false;
    try { return sessionStorage.getItem("search_city_skipped") !== "1"; } catch { return true; }
  });
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
  const [conciergeBusy, setConciergeBusy] = useState(false); // Section 81
  const [conciergeHint, setConciergeHint] = useState(null); // {slug, name_es, emoji, reasoning_es}
  const [view, setView] = useState(() => {
    const v = params.get("view");
    return v === "map" || v === "split" ? v : "list";
  });
  const [mapProviders, setMapProviders] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const sentinelRef = useRef(null);
  const listCardRefs = useRef({});

  // Section 75 — Save-to-shortlist state. Logged-in users get a heart
  // icon on each card; clicking toggles bookmark via /saved-ecards. We
  // load the list once on mount so all visible cards render with the
  // correct state without N extra requests.
  const [savedIds, setSavedIds] = useState(() => new Set());

  useEffect(() => {
    if (!user) { setSavedIds(new Set()); return; }
    let alive = true;
    api.get("/saved-ecards/me?filter=bookmark")
      .then((r) => {
        if (!alive) return;
        const ids = new Set((r.data || []).map((s) => s.provider_id));
        setSavedIds(ids);
      })
      .catch(() => { /* silent — guest or new account */ });
    return () => { alive = false; };
  }, [user]);

  const toggleSaved = useCallback(async (providerId) => {
    if (!user) {
      // Section 75 — prompt sign-in so guests don't lose intent. Preserve
      // current URL via the `next` query so they return to /buscar after.
      const next = window.location.pathname + window.location.search;
      navigate(`/login?next=${encodeURIComponent(next)}&role=client`);
      toast.message(lang === "en" ? "Sign in to save providers." : "Inicia sesión para guardar proveedores.");
      return;
    }
    const wasSaved = savedIds.has(providerId);
    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev);
      if (wasSaved) next.delete(providerId); else next.add(providerId);
      return next;
    });
    try {
      if (wasSaved) {
        await api.delete(`/saved-ecards/${providerId}`);
      } else {
        await api.put("/saved-ecards", { provider_id: providerId, save_type: "bookmark" });
        toast.success(lang === "en" ? "Saved to your shortlist" : "Guardado en tu lista");
      }
    } catch (err) {
      // Rollback on failure
      setSavedIds(prev => {
        const next = new Set(prev);
        if (wasSaved) next.add(providerId); else next.delete(providerId);
        return next;
      });
      toast.error(err?.response?.data?.detail || "Error");
    }
  }, [user, savedIds, navigate, lang]);

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

  // Section 81 — AI Concierge: classifies the free-text query to a real
  // subcategory slug via /search/concierge (Gemini Flash + 7-day cache).
  // Triggered manually by the ✨ button to keep traffic low and explicit.
  const askConcierge = async () => {
    const text = (q || "").trim();
    if (text.length < 5) {
      toast.message(lang === "en" ? "Type at least a few words." : "Escribe al menos unas palabras.");
      return;
    }
    setConciergeBusy(true);
    setConciergeHint(null);
    try {
      const { data } = await api.post("/search/concierge", { query: text, lang });
      if (!data?.slug) {
        toast.message(lang === "en" ? "Couldn't auto-detect a service." : "No detecté una categoría exacta.");
        setConciergeBusy(false);
        return;
      }
      setConciergeHint(data);
      setCategory(data.slug);
      setTimeout(() => doSearch(null, {}), 0);
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "AI unavailable" : "IA no disponible"));
    } finally {
      setConciergeBusy(false);
    }
  };

  // Section 18F — auto-research when user enables "Near me"
  useEffect(() => {
    if (position) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F8FCFD" }}>
      <SeoHead
        title={lang === "en" ? "Search service pros" : "Buscar profesionales"}
        description={lang === "en"
          ? "Find verified service professionals near you — plumbers, electricians, cleaning, landscaping & more."
          : "Encuentra profesionales verificados cerca de ti — plomeros, electricistas, limpieza, jardinería y más."}
        lang={lang}
      />
      <Header />
      {/* Section 89 v7 Item 4 — first-time location prompt */}
      <LocationPrompt
        open={locationPromptOpen}
        onClose={() => setLocationPromptOpen(false)}
        onConfirm={({ city: c, state: s }) => {
          const display = c && s ? `${c}, ${s}` : c || "";
          setCity(display);
        }}
      />
      {/* Section V11.2 — Search bar now scrolls naturally with the page
          on all screen sizes (user feedback May 30 2026: sticky bar was
          trapping the page mid-scroll). Sentinel + `stuck` state are
          preserved as no-ops so existing tests/data-attrs keep working. */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

      <div
        className="z-30"
        data-testid="search-sticky-bar"
        data-stuck={stuck}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 pb-4">
          <form onSubmit={doSearch} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 flex flex-col md:flex-row gap-2 mb-4" data-testid="search-form">
            <div className="flex items-center gap-2 px-3 flex-1">
              <SearchIcon className="w-5 h-5 text-slate-400" />
              <input value={q} onChange={e => { setQ(e.target.value); setConciergeHint(null); }} placeholder={t("hero.search.placeholder")} className="w-full py-3 outline-none bg-transparent" data-testid="search-q-input" />
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
            <div className="flex gap-2">
              {/* Section 81 — AI Concierge: ✨ icon button beside Search.
                  One tap → LLM classifies the query → auto-selects best category. */}
              <button
                type="button"
                onClick={askConcierge}
                disabled={conciergeBusy}
                className={`inline-flex items-center justify-center h-11 px-3 rounded-xl border transition shrink-0 ${conciergeBusy ? "bg-slate-100 border-slate-200 cursor-wait" : "bg-white border-violet-200 hover:border-violet-400 hover:bg-violet-50"}`}
                aria-label={lang === "en" ? "AI search" : "Búsqueda con IA"}
                title={lang === "en" ? "Let AI find the right category" : "Que la IA encuentre la categoría"}
                data-testid="ai-concierge-btn"
              >
                {conciergeBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                ) : (
                  <Sparkles className="w-4 h-4 text-violet-500" />
                )}
                <span className="ml-1.5 text-xs font-semibold text-violet-700 hidden sm:inline">{lang === "en" ? "AI" : "IA"}</span>
              </button>
              <button type="submit" className="btn-primary" data-testid="search-submit">{t("hero.search.cta")}</button>
            </div>
          </form>

          {/* Section 89 v7 Item 4 — persistent location chip. Shows the
              currently-saved city and lets the user reopen the prompt
              or clear it entirely. */}
          {(city || readSavedLocation().city) && (
            <div className="-mt-1 mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F0F9FF] border border-[#90E0EF] text-xs font-semibold text-[#0077B6]" data-testid="search-location-chip">
              <MapPin className="w-3.5 h-3.5" />
              <span>📍 {city || readSavedLocation().city}</span>
              <button
                type="button"
                onClick={() => setLocationPromptOpen(true)}
                className="text-[10px] uppercase tracking-wider font-bold hover:underline"
                data-testid="search-location-chip-change"
              >
                {lang === "en" ? "Change" : "Cambiar"}
              </button>
              <button
                type="button"
                onClick={() => { setCity(""); clearLocation(); }}
                className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:underline"
                data-testid="search-location-chip-clear"
              >
                {lang === "en" ? "All US" : "Toda EE.UU."}
              </button>
            </div>
          )}

          {/* Section 81 — AI Concierge result hint */}
          {conciergeHint && (
            <div
              className="-mt-2 mb-4 px-3 py-2 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 flex items-start gap-2"
              data-testid="ai-concierge-hint"
            >
              <Sparkles className="w-4 h-4 mt-0.5 text-violet-500 shrink-0" />
              <div className="flex-1 text-xs text-slate-700">
                <span className="font-semibold">{lang === "en" ? "AI picked" : "La IA eligió"}: </span>
                <span className="text-base mr-1">{conciergeHint.emoji}</span>
                <span className="font-bold text-slate-900">{lang === "en" ? conciergeHint.name_en : conciergeHint.name_es}</span>
                <span className="text-slate-500"> — {conciergeHint.reasoning_es}</span>
              </div>
              <button
                type="button"
                onClick={() => { setConciergeHint(null); setCategory(""); setTimeout(() => doSearch(), 0); }}
                className="text-[11px] text-violet-600 hover:text-violet-800 underline shrink-0"
                data-testid="ai-concierge-undo"
              >
                {lang === "en" ? "Undo" : "Deshacer"}
              </button>
            </div>
          )}

          {/* Section 80b — Service picker now lives INSIDE the filter
              card (see <aside> below), not outside. Removed the standalone
              row to keep the filter as the single source of truth. */}

          {/* Section 18F — Radius selector (only when "Near me" is active) */}
          {position && (
            <div className="mb-4 flex items-center gap-2 flex-wrap bg-teal-50/60 border border-teal-100 rounded-2xl px-3 py-2.5" data-testid="radius-selector">
              <Navigation className="w-4 h-4 flex-shrink-0" style={{ color: "#03045E" }} />
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
                    style={active ? { backgroundColor: "#03045E" } : {}}
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
              backgroundColor: hasVideo ? "#03045E" : "#FFFFFF",
              color: hasVideo ? "#FFFFFF" : "#03045E",
              borderColor: hasVideo ? "#03045E" : "#BCC5CC",
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
              style={{ backgroundColor: view === "list" ? "#03045E" : "transparent", color: view === "list" ? "#FFFFFF" : "#03045E" }}
              data-testid="view-toggle-list"
              aria-pressed={view === "list"}
            >
              <List className="w-4 h-4" /> Lista
            </button>
            <button
              type="button"
              onClick={() => setView("split")}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition border-l border-r"
              style={{ backgroundColor: view === "split" ? "#03045E" : "transparent", color: view === "split" ? "#FFFFFF" : "#03045E", borderColor: "#BCC5CC" }}
              data-testid="view-toggle-split"
              aria-pressed={view === "split"}
            >
              <LayoutPanelLeft className="w-4 h-4" /> Split
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition"
              style={{ backgroundColor: view === "map" ? "#03045E" : "transparent", color: view === "map" ? "#FFFFFF" : "#03045E" }}
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
            <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: "#03045E" }}>
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
                        borderColor: isHighlighted ? "#0077B6" : "#E2E8F0",
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
                            <Link to={`/provider/${p.slug}`} onClick={e => e.stopPropagation()} className="font-display font-semibold text-base truncate hover:underline" style={{ color: "#03045E" }}>{p.business_name}</Link>
                            {p.rating_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-semibold flex-shrink-0" style={{ color: "#03045E" }}>
                                <Star className="w-3.5 h-3.5 fill-current" style={{ color: "#F59E0B" }} /> {Number(p.rating_avg).toFixed(1)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {p.city}{p.state ? `, ${p.state}` : ""}
                            {typeof p.distance_miles === "number" && p.distance_miles < 9999 && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#E0F2F1", color: "#03045E" }} data-testid={`distance-badge-split-${p.slug}`}>
                                <Navigation className="w-2.5 h-2.5" /> {p.distance_miles.toFixed(1)} mi
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {p.verified && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EBF8F7", color: "#03045E", border: "1px solid #A6E1DA" }}>
                                <VerifiedBadge size={10} /> Verificado
                              </span>
                            )}
                            {p.video_url && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: "#03045E" }} data-testid={`split-video-badge-${p.slug}`}>
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
                {/* Section 80b — Hierarchical picker lives inside the filter
                    panel (mobile + desktop). Tap → bottom-sheet with the 14
                    sectors → drill into one → pick a real subcategory. */}
                {(() => {
                  const picked = categories.find(c => c.slug === category);
                  return (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className={`w-full h-10 px-3 rounded-xl border flex items-center gap-2 text-left transition ${picked ? "border-teal-400 bg-teal-50/40" : "border-slate-200 hover:border-teal-400 bg-white"}`}
                      data-testid="open-category-picker"
                    >
                      {picked ? (
                        <>
                          <span className="text-base leading-none">{picked.emoji || "🛠️"}</span>
                          <span className="flex-1 truncate text-sm text-slate-900">{lang === "en" ? picked.name_en : picked.name_es}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-base leading-none">🧭</span>
                          <span className="flex-1 text-sm text-slate-500">{lang === "en" ? "All services" : "Todas"}</span>
                        </>
                      )}
                    </button>
                  );
                })()}
                {category && (
                  <button
                    type="button"
                    onClick={() => { setCategory(""); setTimeout(() => doSearch(), 0); }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 transition"
                    data-testid="clear-category"
                  >
                    <X className="w-3 h-3" /> {lang === "en" ? "Clear" : "Quitar"}
                  </button>
                )}
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
            <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: "#03045E" }} data-testid="search-results-title">
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
                  <SearchResultCard
                    key={p.provider_id}
                    provider={p}
                    isSaved={savedIds.has(p.provider_id)}
                    onToggleSave={toggleSaved}
                  />
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
