import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import { Sparkles, Heart, ChevronRight, ShieldCheck } from "lucide-react";
import { buildFileUrl } from "./ImageUpload";

/**
 * BannerOfTheWeekCard — marketing showcase for the public Landing page.
 *
 * Pulls the most-liked banner from the last 7 days (with all-time fallback)
 * and displays it as a hero strip. Drives:
 *   - Organic visibility for the featured provider (their eCard)
 *   - Aspiration for other providers ("yo quiero salir aquí") → Banner Pro adoption
 *   - Traffic into /galeria-banners
 *
 * Renders nothing if there are no published banners yet.
 */
export default function BannerOfTheWeekCard() {
  const { lang } = useI18n();
  const [banner, setBanner] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get("/banners/banner-of-the-week")
      .then((r) => { if (alive) setBanner(r.data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  if (!loaded || !banner) return null;

  const providerPath = lang === "en" && banner.provider_slug
    ? `/provider/${banner.provider_slug}`
    : (banner.provider_slug ? `/p/${banner.provider_slug}` : "#");
  const galleryPath = lang === "en" ? "/banner-gallery" : "/galeria-banners";

  return (
    <section className="container mx-auto px-4 md:px-6 py-10" data-testid="banner-of-the-week">
      <div className="max-w-6xl mx-auto">
        {/* Section title strip */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-gradient-to-r from-pink-100 to-orange-100 text-pink-700 text-[11px] font-bold uppercase tracking-wide mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              {lang === "en" ? "Banner of the week" : "Banner de la semana"}
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-slate-900">
              {lang === "en"
                ? "This week's most-loved banner"
                : "El banner más querido de la semana"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {lang === "en"
                ? "Real providers in our community — generated with AI in under a minute."
                : "Proveedores reales de la comunidad — generados con IA en menos de un minuto."}
            </p>
          </div>
          <Link
            to={galleryPath}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-white border border-slate-200 hover:border-pink-300 hover:text-pink-600 text-sm font-medium text-slate-700 transition flex-shrink-0"
            data-testid="banner-of-the-week-gallery-link"
          >
            {lang === "en" ? "See full gallery" : "Ver galería"}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Featured banner card */}
        <div className="grid md:grid-cols-5 gap-5 items-stretch bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition duration-500">
          {/* Image — left 3/5 */}
          <Link
            to={providerPath}
            className="md:col-span-3 block group relative bg-slate-100 overflow-hidden"
            data-testid="banner-of-the-week-image"
          >
            <div className="aspect-[1200/630] overflow-hidden">
              <img
                src={buildFileUrl(banner.image_url)}
                alt={banner.business_name || ""}
                loading="eager"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
              />
            </div>
            {/* Likes badge */}
            <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-white/95 backdrop-blur text-rose-600 text-sm font-bold shadow-md" data-testid="banner-of-the-week-likes">
              <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
              {banner.likes || 0}
            </span>
            <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-3 h-8 rounded-full text-white text-[11px] font-bold shadow-md" style={{ background: banner.color || "#0D7377" }}>
              {banner.style?.toUpperCase() || "PRO"}
            </span>
          </Link>

          {/* Info — right 2/5 */}
          <div className="md:col-span-2 p-5 md:p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-start gap-3">
                {banner.logo_url ? (
                  <img src={buildFileUrl(banner.logo_url)} alt="" className="w-14 h-14 rounded-2xl object-cover bg-slate-100 flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-xl font-bold text-teal-700 flex-shrink-0">
                    {(banner.business_name || "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-lg md:text-xl text-slate-900 truncate" data-testid="banner-of-the-week-business">
                    {banner.business_name}
                    {banner.verified && <ShieldCheck className="w-4 h-4 inline-block ml-1 text-emerald-500" />}
                  </h3>
                  <p className="text-sm text-slate-500 truncate mt-0.5">
                    {[banner.city, banner.state].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-4 leading-relaxed">
                {lang === "en"
                  ? "This provider designed their digital banner with our AI tool — and the community loved it. Want one for your business?"
                  : "Este proveedor diseñó su banner digital con nuestra IA — y la comunidad lo amó. ¿Quieres uno para tu negocio?"}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                to={providerPath}
                className="inline-flex items-center justify-center gap-2 h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
                data-testid="banner-of-the-week-cta-provider"
              >
                {lang === "en" ? `View ${banner.business_name}'s eCard` : `Conoce a ${banner.business_name}`}
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                to="/registro?role=provider"
                className="inline-flex items-center justify-center gap-2 h-10 rounded-full bg-gradient-to-r from-pink-50 to-rose-50 hover:from-pink-100 hover:to-rose-100 border border-pink-100 text-pink-700 text-xs font-semibold transition"
                data-testid="banner-of-the-week-cta-signup"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {lang === "en" ? "Create my banner with AI" : "Crear el mío con IA"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
