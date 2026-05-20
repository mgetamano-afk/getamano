import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { Check, Sparkles } from "lucide-react";

export default function Plans() {
  const { t, lang } = useI18n();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    api.get("/plans").then(r => setPlans(r.data));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20" data-testid="plans-page">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-orange-700 font-semibold bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
            <Sparkles className="w-3.5 h-3.5" /> Planes para proveedores
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mt-4">{t("plans.title")}</h1>
          <p className="text-slate-500 mt-3 max-w-2xl mx-auto">{t("plans.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map(p => {
            const features = lang === "es" ? p.features_es : p.features_en;
            const name = lang === "es" ? p.name : p.name_en;
            return (
              <div key={p.id} className={`rounded-2xl border-2 p-6 md:p-8 bg-white ${p.highlight ? "border-orange-500 shadow-xl shadow-orange-100 relative" : "border-slate-200"}`} data-testid={`plan-card-${p.id}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Más popular</span>}
                <h3 className="font-display text-2xl font-bold text-slate-900">{name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display text-4xl font-bold text-slate-900">${p.price_monthly}</span>
                  <span className="text-slate-500 mb-1">{t("plans.monthly")}</span>
                </div>
                <ul className="mt-6 space-y-3 min-h-[200px]">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register?intent=provider" className={`mt-8 inline-flex justify-center w-full ${p.highlight ? "btn-secondary" : "btn-outline"}`} data-testid={`plan-cta-${p.id}`}>
                  {t("plans.choose")}
                </Link>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-slate-400 mt-8">Pagos via Stripe próximamente. Hoy todos los planes operan en modo Beta gratuito.</p>
      </main>
      <Footer />
    </div>
  );
}
