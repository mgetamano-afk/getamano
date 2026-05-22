import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { Check, Sparkles } from "lucide-react";
import PlanRecommender from "../components/PlanRecommender";

/** Per-experiment deterministic A/B assignment from session_id.
 *  Matches the same algorithm in PlanRecommender so a session sees consistent
 *  variants across pages. */
function getOrCreateSessionId() {
  try {
    let id = localStorage.getItem("quiz_session_id");
    if (!id) {
      id = "qs_" + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
      localStorage.setItem("quiz_session_id", id);
    }
    return id;
  } catch (_e) { return "qs_" + Math.random().toString(36).slice(2, 14); }
}
function getVariant(sessionId, experimentName) {
  if (!sessionId) return "A";
  const key = `${sessionId}:${experimentName}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * 31) % 100003;
  return h % 2 === 0 ? "A" : "B";
}
const ORDER_EXPERIMENT = "plan_card_order_v1";
// A = ascending (free → premium, default). B = anchor in value (pro → premium → basic → free).
const PLAN_ORDER_B = ["pro", "premium", "basic", "free"];

export default function Plans() {
  const { t, lang } = useI18n();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    api.get("/plans").then(r => setPlans(r.data));
  }, []);

  // plan_card_order_v1: A = ascending (free → premium, default).
  //                    B = anchor on value (pro → premium → basic → free)
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const orderVariant = useMemo(() => getVariant(sessionId, ORDER_EXPERIMENT), [sessionId]);
  const orderedPlans = useMemo(() => {
    if (orderVariant !== "B" || !plans.length) return plans;
    const map = Object.fromEntries(plans.map(p => [p.id, p]));
    return PLAN_ORDER_B.map(id => map[id]).filter(Boolean);
  }, [plans, orderVariant]);

  // Fire "opened" event for plan_card_order_v1 once per page load
  useEffect(() => {
    if (!plans.length) return;
    api.post("/quiz/track", {
      session_id: sessionId,
      event: "opened",
      experiment: ORDER_EXPERIMENT,
      variant: orderVariant,
      lang,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans.length]);

  const trackPlanClick = (planId) => {
    api.post("/quiz/track", {
      session_id: sessionId,
      event: "cta_clicked",
      experiment: ORDER_EXPERIMENT,
      variant: orderVariant,
      recommended_plan: planId,
      lang,
    }).catch(() => {});
  };

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

        {/* Smart Recommender — quiz "What plan do I need?" */}
        <PlanRecommender />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-12" data-variant={orderVariant}>
          {orderedPlans.map(p => {
            const features = lang === "es" ? p.features_es : p.features_en;
            const name = lang === "es" ? p.name : p.name_en;
            return (
              <div key={p.id} className={`rounded-2xl border-2 p-6 md:p-7 bg-white ${p.highlight ? "border-orange-500 shadow-xl shadow-orange-100 relative" : "border-slate-200"}`} data-testid={`plan-card-${p.id}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">{lang === "en" ? "Most popular" : "Más popular"}</span>}
                <h3 className="font-display text-xl font-bold text-slate-900">{name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display text-4xl font-bold text-slate-900">${p.price_monthly}</span>
                  <span className="text-slate-500 mb-1">{t("plans.monthly")}</span>
                </div>
                <ul className="mt-5 space-y-2.5 min-h-[220px]">
                  {features.map((f, i) => (
                    <li key={`${p.id}-${i}`} className="flex items-start gap-2 text-[13px] text-slate-700">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to={`/register?intent=provider&plan=${p.id}`} onClick={() => trackPlanClick(p.id)} className={`mt-6 inline-flex justify-center w-full ${p.highlight ? "btn-secondary" : "btn-outline"}`} data-testid={`plan-cta-${p.id}`}>
                  {p.id === "free" ? (lang === "en" ? "Start free" : "Empezar gratis") : t("plans.choose")}
                </Link>
              </div>
            );
          })}
        </div>

        {/* FAQ section — pre-launch BUG-01 enhancement */}
        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="font-display text-2xl font-semibold text-slate-900 text-center mb-6">
            {lang === "en" ? "Frequently asked questions" : "Preguntas frecuentes"}
          </h2>
          <div className="space-y-3" data-testid="plans-faq">
            {(lang === "en" ? [
              { q: "Can I cancel anytime?", a: "Yes. Subscriptions are month-to-month and you can cancel from your dashboard. No long-term commitments." },
              { q: "Can I switch plans later?", a: "Absolutely. You can upgrade or downgrade at any time. Pro-rated charges apply on the next billing cycle." },
              { q: "How does billing work?", a: "Charges happen monthly through Stripe. You'll get an invoice by email. Currently all plans are in Beta mode (free) until our official launch." },
            ] : [
              { q: "¿Puedo cancelar cuando quiera?", a: "Sí. Todas las suscripciones son mes a mes y puedes cancelar desde tu panel sin compromisos a largo plazo." },
              { q: "¿Puedo cambiar de plan después?", a: "Por supuesto. Puedes subir o bajar de plan en cualquier momento. El cobro prorrateado aplica en el siguiente ciclo." },
              { q: "¿Cómo funciona la facturación?", a: "El cobro es mensual vía Stripe y recibes factura por email. Mientras tanto, todos los planes están en modo Beta gratuito hasta el lanzamiento oficial." },
            ]).map((f, i) => (
              <details key={i} className="rounded-xl border border-slate-200 bg-white p-4 group" data-testid={`plans-faq-${i}`}>
                <summary className="cursor-pointer font-semibold text-slate-900 flex items-center justify-between">
                  {f.q}
                  <span className="text-slate-400 group-open:rotate-180 transition">▾</span>
                </summary>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
        <p className="text-center text-xs text-slate-400 mt-8">{lang === "en" ? "Stripe payments coming soon. All plans operate in Beta-free mode today." : "Pagos vía Stripe próximamente. Hoy todos los planes operan en modo Beta gratuito."}</p>
      </main>
      <Footer />
    </div>
  );
}
