import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { Search as SearchIcon, MapPin, Star, ShieldCheck, Filter } from "lucide-react";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { t, lang } = useI18n();
  const [q, setQ] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [verifiedOnly, setVerifiedOnly] = useState(params.get("verified") === "true");
  const [language, setLanguage] = useState(params.get("language") || "");
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/categories").then(r => setCategories(r.data));
  }, []);

  const doSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    const qs = {};
    if (q) qs.q = q;
    if (city) qs.city = city;
    if (category) qs.category = category;
    if (verifiedOnly) qs.verified = "true";
    if (language) qs.language = language;
    setParams(qs);
    try {
      const { data } = await api.get("/providers", { params: qs });
      setProviders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { doSearch(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <form onSubmit={doSearch} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 flex flex-col md:flex-row gap-2 mb-6" data-testid="search-form">
          <div className="flex items-center gap-2 px-3 flex-1">
            <SearchIcon className="w-5 h-5 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("hero.search.placeholder")} className="w-full py-3 outline-none" data-testid="search-q-input" />
          </div>
          <div className="flex items-center gap-2 px-3 md:border-l border-slate-200 md:max-w-[220px]">
            <MapPin className="w-5 h-5 text-slate-400" />
            <input value={city} onChange={e => setCity(e.target.value)} placeholder={t("hero.search.location")} className="w-full py-3 outline-none" data-testid="search-city-input" />
          </div>
          <button type="submit" className="btn-primary" data-testid="search-submit">{t("hero.search.cta")}</button>
        </form>

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
            <h2 className="font-display text-2xl font-semibold text-slate-900 mb-4" data-testid="search-results-title">
              {t("search.results")} <span className="text-slate-400 text-base font-normal">({providers.length})</span>
            </h2>
            {loading ? (
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
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display font-semibold text-slate-900">{p.business_name}</h3>
                          <p className="text-sm text-slate-500 mt-0.5">{p.city}{p.state ? `, ${p.state}` : ""}</p>
                        </div>
                        {p.rating_count > 0 && (
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Star className="w-4 h-4 fill-orange-500 text-orange-500" /> {p.rating_avg.toFixed(1)}
                          </div>
                        )}
                      </div>
                      {p.category && (
                        <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${p.category.color}15`, color: p.category.color }}>
                          {lang === "es" ? p.category.name_es : p.category.name_en}
                        </span>
                      )}
                      {p.description && <p className="text-sm text-slate-600 mt-3 line-clamp-2">{p.description}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
