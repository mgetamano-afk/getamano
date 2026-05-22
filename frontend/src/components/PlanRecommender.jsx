import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, Camera, MessageSquare, MapPin, CreditCard, Award, ArrowRight, RefreshCcw, Check, Mail, Heart } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";

/** Generate or fetch a stable browser session id for funnel tracking. */
function getOrCreateSessionId() {
  try {
    let id = localStorage.getItem("quiz_session_id");
    if (!id) {
      id = "qs_" + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
      localStorage.setItem("quiz_session_id", id);
    }
    return id;
  } catch (_e) {
    return "qs_" + Math.random().toString(36).slice(2, 14);
  }
}

/** Deterministic A/B variant assignment from sessionId. Same session = same variant.
 *  ~50/50 split via simple char-sum modulo 2. Idempotent and zero-state. */
function getVariant(sessionId) {
  if (!sessionId) return "A";
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h + sessionId.charCodeAt(i)) % 1000;
  return h % 2 === 0 ? "A" : "B";
}

const EXPERIMENT = "result_cta_v1";

/** Fire-and-forget tracking call. Never blocks the UI. */
function track(sessionId, event, extra = {}) {
  try {
    const variant = getVariant(sessionId);
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/quiz/track`;
    const body = JSON.stringify({ session_id: sessionId, event, variant, experiment: EXPERIMENT, ...extra });
    if (event === "abandoned" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
    api.post("/quiz/track", { session_id: sessionId, event, variant, experiment: EXPERIMENT, ...extra }).catch(() => {});
  } catch (_e) { /* ignore */ }
}

/**
 * PlanRecommender — 4-question interactive quiz that scores each tier
 * and surfaces the best-fit plan with a clear "why we chose this".
 *
 * Scoring logic: each answer adds points to one or more plans. After all
 * questions are answered, the plan with the highest score wins. Ties favor
 * the cheaper plan (Free < Basic < Pro < Premium) so we never over-sell.
 */
const QUESTIONS_ES = [
  {
    id: "photos",
    icon: Camera,
    q: "¿Cuántas fotos compartes de tu trabajo?",
    options: [
      { label: "Solo 1-2, voy empezando", weight: { free: 3, basic: 1 } },
      { label: "Entre 5 y 20, ya tengo portafolio", weight: { basic: 3, pro: 1 } },
      { label: "Más de 20 + quiero video", weight: { pro: 3, premium: 2 } },
    ],
  },
  {
    id: "leads",
    icon: MessageSquare,
    q: "¿Qué tan rápido necesitas responder a clientes?",
    options: [
      { label: "Cuando pueda, no es urgente", weight: { free: 2, basic: 2 } },
      { label: "El mismo día está bien", weight: { basic: 2, pro: 2 } },
      { label: "Necesito notificación en tiempo real + WhatsApp directo", weight: { pro: 3, premium: 2 } },
    ],
  },
  {
    id: "reach",
    icon: MapPin,
    q: "¿Quieres aparecer primero en las búsquedas de tu ciudad?",
    options: [
      { label: "Por ahora no, solo quiero presencia", weight: { free: 3 } },
      { label: "Que aparezca arriba sería un plus", weight: { basic: 2, pro: 3 } },
      { label: "Sí, quiero el TOP y aparecer en homepage", weight: { premium: 4 } },
    ],
  },
  {
    id: "growth",
    icon: CreditCard,
    q: "¿Inviertes ya en publicidad o marketing?",
    options: [
      { label: "No, todavía no", weight: { free: 3, basic: 1 } },
      { label: "Algo en Facebook/Instagram", weight: { basic: 2, pro: 2 } },
      { label: "Sí y quiero reportes mensuales + boosts", weight: { pro: 2, premium: 4 } },
    ],
  },
];

const QUESTIONS_EN = [
  {
    id: "photos",
    icon: Camera,
    q: "How many photos of your work do you share?",
    options: [
      { label: "Just 1-2, getting started", weight: { free: 3, basic: 1 } },
      { label: "5-20, I have a portfolio", weight: { basic: 3, pro: 1 } },
      { label: "More than 20 + I want video", weight: { pro: 3, premium: 2 } },
    ],
  },
  {
    id: "leads",
    icon: MessageSquare,
    q: "How fast do you need to respond to clients?",
    options: [
      { label: "Whenever I can, no rush", weight: { free: 2, basic: 2 } },
      { label: "Same-day is fine", weight: { basic: 2, pro: 2 } },
      { label: "Real-time + direct WhatsApp", weight: { pro: 3, premium: 2 } },
    ],
  },
  {
    id: "reach",
    icon: MapPin,
    q: "Do you want to rank top in your city's searches?",
    options: [
      { label: "Not now, just want presence", weight: { free: 3 } },
      { label: "Ranking higher would be nice", weight: { basic: 2, pro: 3 } },
      { label: "Yes, I want TOP + homepage featured", weight: { premium: 4 } },
    ],
  },
  {
    id: "growth",
    icon: CreditCard,
    q: "Do you already invest in marketing/ads?",
    options: [
      { label: "Not yet", weight: { free: 3, basic: 1 } },
      { label: "Some Facebook/Instagram", weight: { basic: 2, pro: 2 } },
      { label: "Yes, and I want monthly reports + boosts", weight: { pro: 2, premium: 4 } },
    ],
  },
];

const PLAN_META = {
  free:    { name: "Free",    price: 0,  color: "#64748B" },
  basic:   { name: "Basic",   price: 10, color: "#3B82F6" },
  pro:     { name: "Pro",     price: 15, color: "#F97316" },
  premium: { name: "Premium", price: 25, color: "#7C3AED" },
};

const TIE_ORDER = { free: 0, basic: 1, pro: 2, premium: 3 };

export default function PlanRecommender() {
  const { lang } = useI18n();
  const questions = lang === "en" ? QUESTIONS_EN : QUESTIONS_ES;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [opened, setOpened] = useState(false);
  const sessionIdRef = useRef(null);
  const completedRef = useRef(false);
  const emailCapturedRef = useRef(false);

  if (!sessionIdRef.current) sessionIdRef.current = getOrCreateSessionId();
  const variant = getVariant(sessionIdRef.current);

  // Fire "opened" the first time the user clicks the CTA
  useEffect(() => {
    if (opened) {
      track(sessionIdRef.current, "opened", { lang });
    }
  }, [opened, lang]);

  const totals = useMemo(() => {
    const acc = { free: 0, basic: 0, pro: 0, premium: 0 };
    questions.forEach(q => {
      const a = answers[q.id];
      if (a === undefined) return;
      const w = q.options[a]?.weight || {};
      Object.entries(w).forEach(([plan, pts]) => { acc[plan] += pts; });
    });
    return acc;
  }, [answers, questions]);

  const recommended = useMemo(() => {
    if (!submitted) return null;
    // pick the plan with max score; ties broken by cheapest plan
    let best = "free";
    let bestScore = -1;
    (Object.keys(totals)).forEach(p => {
      const score = totals[p];
      if (score > bestScore || (score === bestScore && TIE_ORDER[p] < TIE_ORDER[best])) {
        best = p;
        bestScore = score;
      }
    });
    return best;
  }, [totals, submitted]);

  // Fire "completed" + final recommendation once the result view is reached
  useEffect(() => {
    if (submitted && recommended && !completedRef.current) {
      completedRef.current = true;
      track(sessionIdRef.current, "completed", {
        answers, recommended_plan: recommended, lang,
      });
    }
  }, [submitted, recommended, answers, lang]);

  // Abandonment tracking: if the user closes/navigates after answering 2+
  // questions WITHOUT completing, send a beacon. Only fires once.
  useEffect(() => {
    if (!opened) return;
    const onBeforeUnload = () => {
      const answeredCount = Object.keys(answers).length;
      if (answeredCount >= 2 && !completedRef.current) {
        track(sessionIdRef.current, "abandoned", {
          step, answers, lang,
        });
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onBeforeUnload();
    });
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [opened, answers, step, lang]);

  const T = useMemo(() => lang === "en" ? {
    title: "What plan do I need?",
    subtitle: "Answer 4 quick questions and we'll suggest the best-fit tier — no calculations needed.",
    cta: "Take the 30-second quiz",
    progress: "Question",
    of: "of",
    back: "Back",
    next: "Next",
    seeResult: "See my recommendation",
    weRecommend: "We recommend",
    becauseTitle: "Why this fits you:",
    cheapest: "And the best part:",
    cheapestBody: "you can start free today and upgrade only when your eCard is generating bookings.",
    cta_go: "Pick this plan",
    cta_alt: "Or compare all plans below",
    restart: "Take the quiz again",
    pillsLabel: "Your scores",
  } : {
    title: "¿Qué plan necesito?",
    subtitle: "Responde 4 preguntas rápidas y te sugerimos el tier ideal — sin que tengas que sacar cuentas.",
    cta: "Hacer el quiz de 30 segundos",
    progress: "Pregunta",
    of: "de",
    back: "Atrás",
    next: "Siguiente",
    seeResult: "Ver mi recomendación",
    weRecommend: "Te recomendamos",
    becauseTitle: "Por qué te queda bien:",
    cheapest: "Y lo mejor:",
    cheapestBody: "puedes empezar gratis hoy y subir de plan cuando tu eCard te esté generando reservas.",
    cta_go: "Elegir este plan",
    cta_alt: "O compara todos los planes abajo",
    restart: "Hacer el quiz otra vez",
    pillsLabel: "Tu puntaje",
  }, [lang]);

  // A/B variant copy — overrides the default `cta_go` and email banner labels
  // for variant B (urgency/value-driven). Both variants ship in production
  // simultaneously; the backend pairs the session_id with the variant value.
  const VARIANT_COPY = useMemo(() => {
    if (variant !== "B") return null;
    return lang === "en" ? {
      cta_go: "Start getting clients today",
      bannerTitle: "Want 5 quick wins for your eCard?",
      bannerSub: "We'll email you 5 actionable tips this week + save your recommendation.",
      bannerCta: "Send me my 5 tips",
    } : {
      cta_go: "Empezar a recibir clientes hoy",
      bannerTitle: "¿Quieres 5 acciones rápidas para tu eCard?",
      bannerSub: "Te mandamos 5 tips esta semana + guardamos tu recomendación.",
      bannerCta: "Mándame mis 5 tips",
    };
  }, [variant, lang]);

  if (!opened) {
    return (
      <section className="mt-12 max-w-4xl mx-auto px-4" data-testid="plan-recommender-collapsed">
        <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ background: "linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)", border: "2px dashed #F59E0B66" }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white text-orange-700 text-[11px] font-bold tracking-widest uppercase shadow-sm">
            <Sparkles className="w-3.5 h-3.5" /> {lang === "en" ? "Smart pick" : "Selección inteligente"}
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-3">{T.title}</h2>
          <p className="text-slate-600 mt-2 max-w-xl mx-auto">{T.subtitle}</p>
          <button
            onClick={() => setOpened(true)}
            className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-900 text-white font-semibold hover:bg-slate-800 transition shadow-lg"
            data-testid="plan-recommender-open"
          >
            <Sparkles className="w-4 h-4" /> {T.cta} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    );
  }

  // Result view
  if (submitted && recommended) {
    const meta = PLAN_META[recommended];
    const reasons = buildReasons(answers, recommended, lang);
    return (
      <section className="mt-12 max-w-3xl mx-auto px-4" data-testid="plan-recommender-result">
        <div className="rounded-3xl bg-white border-2 p-7 sm:p-10 shadow-xl" style={{ borderColor: meta.color }}>
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase" style={{ backgroundColor: `${meta.color}15`, color: meta.color }}>
              <Award className="w-3.5 h-3.5" /> {T.weRecommend}
            </div>
            <h3 className="font-display text-4xl sm:text-5xl font-extrabold text-slate-900 mt-3">{meta.name}</h3>
            <div className="mt-1 text-slate-500 text-lg">
              <span className="font-bold text-3xl text-slate-900">${meta.price}</span>{lang === "en" ? "/mo" : "/mes"}
            </div>
          </div>

          <div className="mt-7 rounded-2xl bg-slate-50 p-5">
            <p className="font-semibold text-slate-900 mb-2">{T.becauseTitle}</p>
            <ul className="space-y-2">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: meta.color }} />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-4 italic">
              <strong className="not-italic text-slate-700">{T.cheapest}</strong> {T.cheapestBody}
            </p>
          </div>

          {/* Score breakdown pills */}
          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap" data-testid="plan-recommender-pills">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mr-1">{T.pillsLabel}</span>
            {Object.entries(totals).map(([p, score]) => (
              <span key={p}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${p === recommended ? "text-white" : "text-slate-600 bg-slate-100"}`}
                style={p === recommended ? { backgroundColor: meta.color } : {}}>
                {PLAN_META[p].name} · {score}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link
              to={`/register?intent=provider&plan=${recommended}&via=quiz`}
              onClick={() => track(sessionIdRef.current, "cta_clicked", { recommended_plan: recommended, answers, lang })}
              className="inline-flex items-center gap-1 px-6 py-3 rounded-full text-white font-semibold shadow-lg hover:opacity-90 transition"
              style={{ backgroundColor: meta.color }}
              data-testid="plan-recommender-cta-confirm"
              data-variant={variant}
            >
              {(VARIANT_COPY && VARIANT_COPY.cta_go) || T.cta_go} <ChevronRight className="w-4 h-4" />
            </Link>
            <button
              onClick={() => { setOpened(true); setStep(0); setAnswers({}); setSubmitted(false); completedRef.current = false; emailCapturedRef.current = false; }}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              data-testid="plan-recommender-restart"
            >
              <RefreshCcw className="w-3.5 h-3.5" /> {T.restart}
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-3">{T.cta_alt}</p>

          {/* Email capture banner — optional "save my recommendation" */}
          {!emailCapturedRef.current && (
            <EmailCaptureBanner
              lang={lang}
              variantCopy={VARIANT_COPY}
              onCaptured={async (email) => {
                emailCapturedRef.current = true;
                try {
                  await api.post("/quiz/recover", {
                    session_id: sessionIdRef.current,
                    email, answers,
                    recommended_plan: recommended,
                    lang, variant, experiment: EXPERIMENT,
                  });
                } catch (_e) { /* never blocks */ }
              }}
            />
          )}
        </div>
      </section>
    );
  }

  // Step view
  const currentQ = questions[step];
  const Icon = currentQ.icon;
  const selectedIdx = answers[currentQ.id];
  const isLast = step === questions.length - 1;

  const choose = (idx) => {
    const newAnswers = { ...answers, [currentQ.id]: idx };
    setAnswers(newAnswers);
    track(sessionIdRef.current, "answered", {
      step, answers: newAnswers, lang,
    });
  };

  return (
    <section className="mt-12 max-w-2xl mx-auto px-4" data-testid="plan-recommender-step">
      <div className="rounded-3xl bg-white border border-slate-200 shadow-xl p-6 sm:p-8">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-5" data-testid="quiz-progress">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-orange-500" : i === step ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-2">{T.progress} {step + 1} {T.of} {questions.length}</p>

        {/* Question */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-orange-600" />
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{currentQ.q}</h3>
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {currentQ.options.map((opt, i) => {
            const active = selectedIdx === i;
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition flex items-center justify-between gap-3 ${active ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                data-testid={`quiz-q${step}-option-${i}`}
              >
                <span className={`text-sm sm:text-base ${active ? "font-semibold text-slate-900" : "text-slate-700"}`}>{opt.label}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? "bg-orange-500 border-orange-500" : "border-slate-300"}`}>
                  {active && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Nav */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-30"
            data-testid="quiz-back"
          >
            ← {T.back}
          </button>
          <button
            onClick={() => isLast ? setSubmitted(true) : setStep(s => s + 1)}
            disabled={selectedIdx === undefined}
            className="inline-flex items-center gap-1 px-5 py-2.5 rounded-full bg-slate-900 text-white font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800"
            data-testid="quiz-next"
          >
            {isLast ? T.seeResult : T.next} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Translate answers into human-readable bullets explaining the fit. */
function buildReasons(answers, plan, lang) {
  const r = [];
  const a = answers;
  if (lang === "en") {
    if (a.photos === 0) r.push("You're starting your portfolio — Free gets you a live eCard today.");
    if (a.photos === 1) r.push("With a real portfolio, unlimited photos in Basic+ are essential.");
    if (a.photos === 2) r.push("Pro+ unlocks unlimited photos AND video — the portfolio you deserve.");
    if (a.leads === 0) r.push("You handle replies at your own pace — no upgrade needed.");
    if (a.leads === 1) r.push("Same-day response works great with the standard inbox.");
    if (a.leads === 2) r.push("Real-time notifications + direct WhatsApp button live in Pro and above.");
    if (a.reach === 0) r.push("Plain visibility in /search is included from Free.");
    if (a.reach === 1) r.push("Higher ranking in your city — a key Pro perk.");
    if (a.reach === 2) r.push("Homepage featured + TOP ranking is a Premium-only edge.");
    if (a.growth === 0) r.push("You're not paying for ads — keep it lean.");
    if (a.growth === 1) r.push("Pro's monthly visibility boosts compound your social efforts.");
    if (a.growth === 2) r.push("Premium adds custom QR + monthly campaigns + advanced reports.");
  } else {
    if (a.photos === 0) r.push("Vas empezando — Free te da una eCard pública hoy mismo.");
    if (a.photos === 1) r.push("Con portafolio real, las fotos ilimitadas de Basic+ son clave.");
    if (a.photos === 2) r.push("Pro+ desbloquea fotos ilimitadas Y video — el portafolio que te mereces.");
    if (a.leads === 0) r.push("Respondes a tu ritmo — el inbox estándar te alcanza.");
    if (a.leads === 1) r.push("Respuesta el mismo día funciona perfecto con el plan que elijas.");
    if (a.leads === 2) r.push("Notificación en tiempo real + botón WhatsApp directo vienen desde Pro.");
    if (a.reach === 0) r.push("Visibilidad estándar en /buscar viene incluida desde Free.");
    if (a.reach === 1) r.push("Aparecer arriba en tu ciudad es un beneficio clave de Pro.");
    if (a.reach === 2) r.push("Featured en homepage + TOP ranking es ventaja exclusiva Premium.");
    if (a.growth === 0) r.push("No inviertes en ads — sin gastos extra.");
    if (a.growth === 1) r.push("Los boosts mensuales de Pro multiplican tu esfuerzo en redes.");
    if (a.growth === 2) r.push("Premium suma QR custom + campañas mensuales + reportes avanzados.");
  }
  // Fallback if no answers matched
  return r.length ? r.slice(0, 4) : [lang === "en" ? "Best balance between cost and reach for your stage." : "Es el balance ideal entre costo y alcance para tu etapa."];
}


/**
 * EmailCaptureBanner — appears under the recommendation card. Lets the user
 * save their result + receive bilingual tips. Captured leads are stored in
 * lead_recoveries and will be emailed once Resend is configured.
 */
function EmailCaptureBanner({ lang, variantCopy, onCaptured }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaults = lang === "en" ? {
    title: "Want this in your inbox?",
    sub: "We'll save your recommendation and send tips for your eCard. No spam.",
    placeholder: "your@email.com",
    cta: "Send me my result",
    sent: "Saved! Check your inbox soon.",
  } : {
    title: "¿Quieres recibir esto en tu correo?",
    sub: "Guardamos tu recomendación y te mandamos tips para abrir tu eCard. Cero spam.",
    placeholder: "tu@email.com",
    cta: "Enviarme mi resultado",
    sent: "¡Guardado! Pronto recibirás un correo.",
  };
  // Merge variant overrides on top of defaults
  const T = {
    title: variantCopy?.bannerTitle || defaults.title,
    sub: variantCopy?.bannerSub || defaults.sub,
    placeholder: defaults.placeholder,
    cta: variantCopy?.bannerCta || defaults.cta,
    sent: defaults.sent,
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return;
    setSubmitting(true);
    await onCaptured(email.trim().toLowerCase());
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="mt-6 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2 text-sm text-green-800" data-testid="quiz-email-captured">
        <Heart className="w-4 h-4 fill-green-600 text-green-600" />
        {T.sent}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 p-5" data-testid="quiz-email-banner">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <Mail className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm">{T.title}</p>
          <p className="text-xs text-slate-600 mt-0.5">{T.sub}</p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={T.placeholder}
          required
          className="flex-1 h-11 px-4 rounded-full border border-orange-200 outline-none focus:border-orange-400 text-sm bg-white"
          data-testid="quiz-email-input"
        />
        <button
          type="submit"
          disabled={submitting}
          className="h-11 px-5 rounded-full bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-60"
          data-testid="quiz-email-submit"
        >
          {T.cta}
        </button>
      </form>
    </div>
  );
}
