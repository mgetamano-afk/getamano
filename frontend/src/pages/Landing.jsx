import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Search, MapPin, Sparkles, ShieldCheck, Star, ArrowRight, Heart, TrendingUp, Users, CheckCircle2, ChevronDown } from "lucide-react";

const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/f2dd1a0b-059a-45af-8ff9-693307d92fdc/images/e06985637eaa773af2b061809b8ff14146dca5e2ae81220c3c8d946ecdf7e133.png";
const COMMUNITY_IMG = "https://images.unsplash.com/photo-1722252799088-4781aabc3d0f?w=1200";

export default function Landing() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    api.get("/categories").then(r => setCategories(r.data));
    api.get("/providers/featured").then(r => setFeatured(r.data));
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (loc) params.set("city", loc);
    navigate(`/search?${params.toString()}`);
  };

  const testimonials = [
    { name: "Carmen R.", city: "Tulsa, OK", text: lang === "es" ? "Encontré una catering latina increíble para el cumpleaños de mi hija. ¡Toda mi familia quedó feliz!" : "I found an amazing Latino catering service for my daughter's birthday. My whole family was happy!" },
    { name: "Roberto M.", city: "Dallas, TX", text: lang === "es" ? "Como proveedor, getmano me trajo más clientes que cualquier red social en un mes." : "As a provider, getmano brought me more clients than any social network in one month." },
    { name: "Lupita V.", city: "Phoenix, AZ", text: lang === "es" ? "Por fin una plataforma seria, en español, hecha para nosotros. Confío al 100%." : "Finally a serious platform, in Spanish, made for us. I trust it 100%." },
  ];

  const faqs = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-vignette" />
        <div className="absolute inset-0 bg-grid-slate opacity-40" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-semibold tracking-widest uppercase border border-orange-100">
                <Sparkles className="w-3.5 h-3.5" /> {t("hero.eyebrow")}
              </span>
              <h1 className="font-display mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
                {t("hero.title").split(" ").slice(0, -2).join(" ")}{" "}
                <span className="gradient-text">{t("hero.title").split(" ").slice(-2).join(" ")}</span>
              </h1>
              <p className="mt-5 text-lg text-slate-600 max-w-xl leading-relaxed">{t("hero.subtitle")}</p>

              <form onSubmit={onSearch} className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-2 flex flex-col md:flex-row gap-2" data-testid="hero-search-form">
                <div className="flex items-center gap-2 px-3 flex-1">
                  <Search className="w-5 h-5 text-slate-400" />
                  <input
                    value={q} onChange={e => setQ(e.target.value)}
                    placeholder={t("hero.search.placeholder")}
                    className="w-full py-3 outline-none text-slate-900 placeholder:text-slate-400"
                    data-testid="hero-search-input"
                  />
                </div>
                <div className="flex items-center gap-2 px-3 md:border-l border-slate-200 md:max-w-[220px]">
                  <MapPin className="w-5 h-5 text-slate-400" />
                  <input
                    value={loc} onChange={e => setLoc(e.target.value)}
                    placeholder={t("hero.search.location")}
                    className="w-full py-3 outline-none text-slate-900 placeholder:text-slate-400"
                    data-testid="hero-location-input"
                  />
                </div>
                <button type="submit" className="btn-primary flex items-center justify-center gap-1" data-testid="hero-search-submit">
                  {t("hero.search.cta")} <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link to="/register?intent=provider" className="btn-secondary" data-testid="hero-cta-open-ecard">{t("hero.cta.open")}</Link>
                <Link to="/search" className="btn-outline" data-testid="hero-cta-explore">{t("hero.cta.explore")}</Link>
              </div>

              <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-green-600" /> 100% verificados</span>
                <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-600" /> Comunidad latina USA</span>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="absolute -inset-6 bg-gradient-to-br from-blue-100/40 via-transparent to-orange-100/40 rounded-[3rem] blur-2xl" />
              <img src={HERO_IMG} alt="getmano marketplace" className="relative rounded-[2rem] shadow-2xl shadow-blue-900/10 object-cover w-full h-[520px]" />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl p-4 shadow-xl border border-slate-100 flex items-center gap-3" data-testid="hero-rating-card">
                <div className="flex -space-x-2">
                  <div className="w-9 h-9 rounded-full bg-orange-200 border-2 border-white" />
                  <div className="w-9 h-9 rounded-full bg-blue-200 border-2 border-white" />
                  <div className="w-9 h-9 rounded-full bg-green-200 border-2 border-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1 text-orange-500"><Star className="w-4 h-4 fill-orange-500" /> 4.9 / 5</div>
                  <div className="text-xs text-slate-500">+1,200 reseñas</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="flex items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">{t("categories.title")}</h2>
            <p className="text-slate-500 mt-2">{t("categories.subtitle")}</p>
          </div>
          <Link to="/search" className="hidden md:inline-flex items-center gap-1 text-blue-600 font-medium hover:underline" data-testid="categories-see-all">
            Ver todas <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.slice(0, 8).map(c => (
            <Link
              key={c.category_id}
              to={`/search?category=${c.slug}`}
              className="card-lift bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3"
              data-testid={`category-card-${c.slug}`}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-white" style={{ backgroundColor: c.color }}>
                {(lang === "es" ? c.name_es : c.name_en).charAt(0)}
              </div>
              <div>
                <div className="font-display font-semibold text-slate-900">{lang === "es" ? c.name_es : c.name_en}</div>
                <div className="text-sm text-slate-500 mt-1">Ver proveedores →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED PROVIDERS */}
      {featured.length > 0 && (
        <section className="bg-white border-y border-slate-200/70 py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-10">
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">{t("featured.title")}</h2>
              <p className="text-slate-500 mt-2">{t("featured.subtitle")}</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map(p => (
                <Link key={p.provider_id} to={`/services/${p.slug}`} className="card-lift bg-white rounded-2xl border border-slate-200 overflow-hidden block" data-testid={`featured-provider-${p.slug}`}>
                  <div className="h-40 bg-slate-100 relative">
                    {p.cover_url && <img src={p.cover_url} alt={p.business_name} className="w-full h-full object-cover" />}
                    <div className="absolute top-3 left-3 badge-verified"><ShieldCheck className="w-3.5 h-3.5" /> Verificado</div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display font-semibold text-lg text-slate-900">{p.business_name}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">{p.city}{p.state ? `, ${p.state}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 text-sm font-medium text-slate-800">
                        <Star className="w-4 h-4 fill-orange-500 text-orange-500" />
                        {p.rating_avg.toFixed(1)}
                      </div>
                    </div>
                    {p.category && (
                      <span className="inline-block mt-3 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${p.category.color}15`, color: p.category.color }}>
                        {lang === "es" ? p.category.name_es : p.category.name_en}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight text-center">{t("how.title")}</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {[
            { icon: Search, title: t("how.s1.title"), desc: t("how.s1.desc"), color: "bg-blue-50 text-blue-600" },
            { icon: Heart, title: t("how.s2.title"), desc: t("how.s2.desc"), color: "bg-orange-50 text-orange-600" },
            { icon: ShieldCheck, title: t("how.s3.title"), desc: t("how.s3.desc"), color: "bg-green-50 text-green-600" },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-8" data-testid={`how-step-${i + 1}`}>
              <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center mb-4`}>
                <s.icon className="w-6 h-6" />
              </div>
              <h3 className="font-display font-semibold text-xl text-slate-900">{s.title}</h3>
              <p className="text-slate-600 mt-2 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BENEFITS */}
      <section className="bg-white border-y border-slate-200/70 py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 p-8 bg-gradient-to-br from-blue-50 to-white">
            <h3 className="font-display text-2xl font-semibold text-slate-900">{t("benefits.client.title")}</h3>
            <ul className="mt-6 space-y-3">
              {[t("benefits.client.b1"), t("benefits.client.b2"), t("benefits.client.b3")].map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-700">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" /> {b}
                </li>
              ))}
            </ul>
            <Link to="/search" className="btn-primary inline-flex mt-8" data-testid="benefits-client-cta">{t("hero.cta.explore")}</Link>
          </div>
          <div className="rounded-2xl border border-slate-200 p-8 bg-gradient-to-br from-orange-50 to-white">
            <h3 className="font-display text-2xl font-semibold text-slate-900">{t("benefits.provider.title")}</h3>
            <ul className="mt-6 space-y-3">
              {[t("benefits.provider.b1"), t("benefits.provider.b2"), t("benefits.provider.b3")].map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-700">
                  <TrendingUp className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" /> {b}
                </li>
              ))}
            </ul>
            <Link to="/register?intent=provider" className="btn-secondary inline-flex mt-8" data-testid="benefits-provider-cta">{t("hero.cta.open")}</Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight text-center">{t("testimonials.title")}</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {testimonials.map((tt, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6" data-testid={`testimonial-${i}`}>
              <div className="flex items-center gap-1 text-orange-500 mb-3">
                {[...Array(5)].map((_, k) => <Star key={k} className="w-4 h-4 fill-orange-500" />)}
              </div>
              <p className="text-slate-700 leading-relaxed">"{tt.text}"</p>
              <div className="mt-4 text-sm">
                <div className="font-semibold text-slate-900">{tt.name}</div>
                <div className="text-slate-500">{tt.city}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* COMMUNITY */}
      <section className="bg-slate-900 text-white py-16 md:py-24 relative overflow-hidden">
        <img src={COMMUNITY_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 to-blue-900/70" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">Lo latino, a la mano.</h2>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">getmano nació para fortalecer a nuestra comunidad. Cada perfil es una historia, cada cliente una conexión real.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register?intent=provider" className="btn-secondary" data-testid="community-cta-provider">{t("hero.cta.open")}</Link>
            <Link to="/search" className="px-6 py-3 rounded-full border-2 border-white/30 text-white hover:bg-white/10 font-medium">{t("hero.cta.explore")}</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight text-center">{t("faq.title")}</h2>
        <div className="mt-10 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-6 py-5 flex items-center justify-between text-left font-medium text-slate-900"
                data-testid={`faq-item-${i}`}
              >
                {f.q}
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && (
                <div className="px-6 pb-5 text-slate-600 leading-relaxed">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
