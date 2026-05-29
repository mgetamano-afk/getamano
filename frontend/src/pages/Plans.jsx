import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { Check, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Plans — v3 social-first (Section 88).
 *
 * The 4-tier system (free / basic $10 / pro $15 / premium $25) is gone.
 * The v3 model has exactly TWO options:
 *
 *   1. Proveedor Libre  — $0 — basic eCard, listed in search.
 *   2. Proveedor Verificado — $10/mo — adds:
 *      · ✓ verified badge
 *      · unique GM-XXXX code displayed on the public eCard
 *      · priority in search results
 *      · unlimited messaging
 *      · full analytics
 *      · referral program access
 *
 * Stripe wiring is intentionally absent in Phase 1 (user choice 4b).
 * When keys land, the "Verificarme" button will open a Stripe Checkout
 * session; for now it just hits POST /api/users/me/verify which sets
 * the flag and mints the GM code.
 */
export default function Plans() {
  const { t, lang } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [founder, setFounder] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([
      api.get("/users/me/provider-status"),
      api.get("/founders/status").catch(() => ({ data: null })),
    ]).then(([s, f]) => {
      if (!alive) return;
      setStatus(s.data);
      setFounder(f.data);
    });
    return () => { alive = false; };
  }, [user]);

  const verify = async () => {
    if (verifying) return;
    if (!user) { navigate("/login?next=/plans"); return; }
    if (!status?.is_provider) {
      // Activate first
      try {
        await api.post("/users/me/activate-provider");
      } catch (e) { /* tolerate idempotent re-runs */ }
    }
    setVerifying(true);
    try {
      const { data } = await api.post("/users/me/verify");
      toast.success(
        lang === "en"
          ? `Verified! Your code: ${data.getamano_code}`
          : `¡Verificado! Tu código: ${data.getamano_code}`
      );
      navigate("/account");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setVerifying(false);
    }
  };

  const isVerified = status?.provider_verified;
  const founderSlotsLeft = founder?.slots_remaining ?? 0;
  const isFounderPromoActive = founderSlotsLeft > 0;

  const freePerks = [
    { en: "Free public eCard", es: "eCard pública gratis" },
    { en: "Listed in /buscar search", es: "Aparece en búsquedas /buscar" },
    { en: "Receive messages (basic)", es: "Recibe mensajes (básico)" },
    { en: "Public phone & WhatsApp links", es: "Teléfono y WhatsApp públicos" },
  ];

  const verifiedPerks = [
    { en: "Everything in Free, plus:", es: "Todo de Libre, más:", highlight: true },
    { en: "✓ Verified badge on your eCard", es: "Insignia ✓ Verificado en tu eCard" },
    { en: "Unique GM-XXXX code", es: "Código GM-XXXX único" },
    { en: "Priority in search results", es: "Prioridad en resultados de búsqueda" },
    { en: "Unlimited messaging & quotes", es: "Mensajes y cotizaciones ilimitados" },
    { en: "Full analytics dashboard", es: "Dashboard de analytics completo" },
    { en: "Referral program ($5 per conversion)", es: "Programa de referidos ($5 por conversión)" },
  ];

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full" data-testid="plans-page">
        <header className="text-center mb-10">
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-[#03045E]" data-testid="plans-title">
            {lang === "en" ? "Choose your plan" : "Elige tu plan"}
          </h1>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto text-base sm:text-lg">
            {lang === "en"
              ? "Simple, transparent pricing. Get verified to unlock the full power of getamano."
              : "Precios simples y transparentes. Verifícate para desbloquear todo el poder de getamano."}
          </p>
        </header>

        {/* Founder banner — kept (user choice 4b leaves it as-is, automatic, no card) */}
        {isFounderPromoActive && !isVerified && (
          <div
            className="mb-8 rounded-2xl p-5 text-white shadow-xl flex items-start gap-3 sm:items-center"
            style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)" }}
            data-testid="plans-founder-banner"
          >
            <span className="text-3xl flex-shrink-0">🔥</span>
            <div>
              <p className="font-bold text-base sm:text-lg leading-tight">
                {lang === "en" ? "Founding Members" : "Founding Members"} ·{" "}
                {lang === "en" ? `${founderSlotsLeft} spots left` : `${founderSlotsLeft} cupos restantes`}
              </p>
              <p className="text-sm text-white/90 mt-0.5">
                {lang === "en"
                  ? "First 100 providers: Verified plan FREE until December 2027."
                  : "Primeros 100 proveedores: plan Verificado GRATIS hasta diciembre 2027."}
              </p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5 sm:gap-6">
          {/* Card 1 — Free */}
          <PlanCard
            kind="free"
            title={lang === "en" ? "Free Provider" : "Proveedor Libre"}
            price="$0"
            periodLabel={lang === "en" ? "Forever" : "Por siempre"}
            perks={freePerks}
            lang={lang}
            currentPlan={status?.provider_plan === "free" || (!status?.is_provider)}
            ctaLabel={status?.is_provider
              ? (lang === "en" ? "Current plan" : "Plan actual")
              : (lang === "en" ? "Start free" : "Empezar gratis")}
            ctaTestId="plans-free-cta"
            onCtaClick={() => {
              if (!user) { navigate("/login?next=/plans"); return; }
              if (status?.is_provider) return; // already free
              api.post("/users/me/activate-provider").then(() => navigate("/provider/onboarding"));
            }}
            ctaDisabled={!!status?.is_provider}
          />

          {/* Card 2 — Verified */}
          <PlanCard
            kind="verified"
            title={lang === "en" ? "Verified Provider" : "Proveedor Verificado"}
            price="$10"
            periodLabel={lang === "en" ? "/ month" : "/ mes"}
            perks={verifiedPerks}
            lang={lang}
            highlight
            currentPlan={isVerified}
            ctaLabel={isVerified
              ? (lang === "en" ? "Verified ✓" : "Verificado ✓")
              : verifying
                ? (lang === "en" ? "Verifying…" : "Verificando…")
                : isFounderPromoActive
                  ? (lang === "en" ? "Claim FREE spot" : "Reclamar cupo GRATIS")
                  : (lang === "en" ? "Verify · $10/mo" : "Verificarme · $10/mes")}
            ctaTestId="plans-verified-cta"
            onCtaClick={verify}
            ctaDisabled={isVerified || verifying}
            ctaIcon={verifying ? Loader2 : ShieldCheck}
            ctaIconSpin={verifying}
          />
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          {lang === "en"
            ? "Need help choosing? "
            : "¿Necesitas ayuda eligiendo? "}
          <Link to="/contacto" className="text-[#0077B6] font-semibold hover:underline">
            {lang === "en" ? "Contact us" : "Contáctanos"}
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}

function PlanCard({ kind, title, price, periodLabel, perks, lang, highlight, currentPlan, ctaLabel, ctaTestId, onCtaClick, ctaDisabled, ctaIcon: Icon, ctaIconSpin }) {
  return (
    <div
      className={`relative rounded-3xl p-6 sm:p-8 transition-all ${
        highlight
          ? "bg-gradient-to-br from-[#03045E] to-[#0077B6] text-white shadow-2xl shadow-[#0077B6]/30 sm:-translate-y-2"
          : "bg-white border-2 border-slate-200 text-[#03045E] hover:border-[#0077B6]/30"
      }`}
      data-testid={`plan-card-${kind}`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#00B4D8] text-white text-[11px] font-bold uppercase tracking-wider shadow-lg">
          {lang === "en" ? "Recommended" : "Recomendado"}
        </span>
      )}
      {currentPlan && (
        <span className={`absolute top-4 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${highlight ? "bg-[#00B4D8]/30 text-white" : "bg-[#CAF0F8] text-[#0077B6]"}`}>
          {lang === "en" ? "Current" : "Actual"}
        </span>
      )}
      <h2 className="font-display font-bold text-2xl mb-2">{title}</h2>
      <div className="flex items-baseline gap-1 mb-5">
        <span className="text-4xl sm:text-5xl font-extrabold">{price}</span>
        <span className={`text-sm font-medium ${highlight ? "text-[#CAF0F8]" : "text-slate-500"}`}>{periodLabel}</span>
      </div>
      <ul className="space-y-2.5 mb-6">
        {perks.map((perk, i) => (
          <li key={i} className={`flex items-start gap-2.5 text-sm ${perk.highlight ? (highlight ? "text-[#90E0EF] font-bold" : "text-[#03045E] font-bold") : ""}`}>
            <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${highlight ? "text-[#00B4D8]" : "text-[#0077B6]"}`} strokeWidth={2.5} />
            <span>{lang === "en" ? perk.en : perk.es}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCtaClick}
        disabled={ctaDisabled}
        className={`w-full h-12 rounded-full font-bold transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
          highlight
            ? "bg-white text-[#03045E] hover:brightness-105 shadow-lg"
            : "bg-slate-100 hover:bg-slate-200 text-[#03045E]"
        }`}
        data-testid={ctaTestId}
      >
        {Icon && <Icon className={`w-4 h-4 ${ctaIconSpin ? "animate-spin" : ""}`} />}
        {ctaLabel}
      </button>
    </div>
  );
}
