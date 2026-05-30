import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, X, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";
import VerifiedBadge from "./VerifiedBadge";

/**
 * V8EnrichmentSections — Section 89 v8 Landing enrichment.
 *
 * Six self-contained sections we drop into the existing Landing (or
 * /about page) to flesh out the value proposition without ripping the
 * existing flow apart:
 *   §3 — Verify your business · $10/mo
 *   §4 — Tools to grow (6 cards)
 *   §5 — Reach further (160-mile pitch + stats)
 *   §6 — The complete ecosystem (Free vs Verified table)
 *   §7 — Who we are (heart + tagline)
 *   §8 — Final CTA
 *
 * Bilingual via `useI18n().lang`. The Founder100 banner is fetched
 * lazily and hides itself when slots_used ≥ 100.
 */

const COLORS = {
  navy: "#03045E",
  blue: "#0077B6",
  cyan: "#00B4D8",
  sky: "#90E0EF",
  light: "#CAF0F8",
};

export default function V8EnrichmentSections() {
  const { lang } = useI18n();
  const [founders, setFounders] = useState({ slots_used: 0, slots_remaining: 100, slots_total: 100 });

  useEffect(() => {
    api.get("/founders/status").then(r => setFounders(r.data || founders)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showFounderBanner = (founders.slots_used || 0) < (founders.slots_total || 100);

  return (
    <div data-testid="v8-enrichment" className="v8-enrichment-root">
      {/* §3 Verify your business — $10/mo */}
      <VerifySection lang={lang} showFounderBanner={showFounderBanner} founders={founders} />
      {/* §4 Tools to grow */}
      <ToolsSection lang={lang} />
      {/* §5 Reach further */}
      <ReachSection lang={lang} />
      {/* §6 The complete ecosystem */}
      <EcosystemSection lang={lang} />
      {/* §7 Who we are */}
      <WhoSection lang={lang} />
      {/* §8 Final CTA */}
      <FinalCtaSection lang={lang} />
    </div>
  );
}

// ─── §3 Verify your business · $10/mo ──────────────────────────────
function VerifySection({ lang, showFounderBanner, founders }) {
  const t = lang === "en";
  const benefits = t ? [
    { e: "✅", text: "Unique GM-XXXX verification code — shows clients you're real and trustworthy" },
    { e: "📋", text: "Your own eCard — a professional digital profile you can share anywhere" },
    { e: "📸", text: "Portfolio — showcase your best work with photos and captions" },
    { e: "🎬", text: "Reels — post short videos of your services and reach new clients passively" },
    { e: "⭐", text: "Trust Score — a public 0–100 score that grows as you build your reputation" },
    { e: "📍", text: "Appear in local search — show up when clients near you search your category" },
    { e: "🔔", text: "Instant lead alerts — get notified the moment a client in your area needs your service" },
    { e: "🏆", text: "\"Getamano Verified\" badge on all your content" },
    { e: "📦", text: "Physical business card — we print and mail you a real card with your QR code ($20 one-time)" },
  ] : [
    { e: "✅", text: "Código único GM-XXXX — demuéstrale a los clientes que eres real y de confianza" },
    { e: "📋", text: "Tu propia eCard — un perfil digital profesional que puedes compartir donde quieras" },
    { e: "📸", text: "Portafolio — muestra tu mejor trabajo con fotos y descripciones" },
    { e: "🎬", text: "Reels — publica videos cortos de tus servicios y llega a nuevos clientes pasivamente" },
    { e: "⭐", text: "Índice de Confianza — un puntaje público de 0–100 que crece con tu reputación" },
    { e: "📍", text: "Aparece en búsqueda local — cuando alguien cerca busque tu categoría, tú apareces" },
    { e: "🔔", text: "Alertas de leads al instante — recibe una notificación cuando un cliente en tu área necesite tu servicio" },
    { e: "🏆", text: "Badge \"Verificado por Getamano\" en todo tu contenido" },
    { e: "📦", text: "Tarjeta física de negocio — la imprimimos y te la enviamos con tu QR ($20 una sola vez)" },
  ];
  return (
    <section
      className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8"
      style={{ background: COLORS.navy, color: "white" }}
      data-testid="v8-verify-section"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Left — copy */}
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-bold uppercase tracking-widest" style={{ background: "rgba(255,255,255,0.08)", color: COLORS.cyan }}>
              <VerifiedBadge size={14} />
              {t ? "Verified plan" : "Plan verificado"}
            </span>
            <h2 className="font-display font-extrabold text-4xl sm:text-5xl mt-3 leading-tight">
              {t ? "Verify your business for $10/month" : "Verifica tu negocio por $10/mes"}
            </h2>
            <p className="text-lg mt-3 leading-relaxed" style={{ color: COLORS.sky }}>
              {t
                ? "Everything you need to stand out and get hired — in one plan."
                : "Todo lo que necesitas para destacar y conseguir clientes — en un solo plan."}
            </p>

            {/* Founder100 banner */}
            {showFounderBanner && (
              <div
                className="mt-5 rounded-xl px-4 py-3 flex items-start gap-2 text-sm font-semibold"
                style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)" }}
                data-testid="v8-founder-banner"
              >
                <span className="text-lg">🎖️</span>
                <span style={{ color: "#FCD34D" }}>
                  {t
                    ? `Founding Member spots left: ${founders.slots_remaining} — Get verified FREE until Dec 2027`
                    : `Lugares de Founding Member disponibles: ${founders.slots_remaining} — Verifica gratis hasta dic 2027`}
                </span>
              </div>
            )}

            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-full text-base font-bold transition active:scale-95"
              style={{ background: "white", color: COLORS.navy }}
              data-testid="v8-verify-cta"
            >
              {t ? "Start for $10/month" : "Empezar por $10/mes"}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs mt-2 opacity-70">
              {t ? "Cancel anytime. No setup fees." : "Cancela cuando quieras. Sin costos de activación."}
            </p>
          </div>

          {/* Right — benefits */}
          <ul className="space-y-2.5" data-testid="v8-verify-benefits">
            {benefits.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-4 py-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <span className="text-xl flex-shrink-0">{b.e}</span>
                <span className="text-sm leading-relaxed">{b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── §4 Tools to grow ──────────────────────────────────────────────
function ToolsSection({ lang }) {
  const t = lang === "en";
  const cards = t ? [
    { e: "🎬", title: "Reels",          text: "Post short videos of your work. Clients browse services like they browse social — passively, visually.", badge: "Included" },
    { e: "📸", title: "Portfolio",      text: "Upload up to 12 photos of your best projects. Before & after, completed work, anything that sells.", badge: "Included" },
    { e: "📋", title: "eCard",          text: "Your digital business card. Share it via WhatsApp, Instagram, text, or let clients find it in search.", badge: "Included" },
    { e: "📦", title: "Physical Card",  text: "We print and mail you a real card with your name, QR code, and GM-XXXX. First impression that lasts.", badge: "$20 one-time" },
    { e: "⚡", title: "Featured",       text: "Appear at the top of search and Barrio feed in your area for a week. Premium visibility, affordable price.", badge: "from $5/week" },
    { e: "💼", title: "Chambas",        text: "Find sponsored job posts from businesses looking for your skills. Apply directly from the app.", badge: "Included" },
  ] : [
    { e: "🎬", title: "Reels",          text: "Publica videos cortos de tu trabajo. Los clientes exploran servicios como si fuera redes sociales — de forma pasiva y visual.", badge: "Incluido" },
    { e: "📸", title: "Portafolio",     text: "Sube hasta 12 fotos de tus mejores proyectos. Antes y después, trabajo terminado, lo que venda.", badge: "Incluido" },
    { e: "📋", title: "eCard",          text: "Tu tarjeta de negocio digital. Compártela por WhatsApp, Instagram, SMS o deja que los clientes te encuentren en la búsqueda.", badge: "Incluido" },
    { e: "📦", title: "Tarjeta Física", text: "La imprimimos y te la enviamos con tu nombre, código QR y GM-XXXX. Primera impresión que dura.", badge: "$20 una vez" },
    { e: "⚡", title: "Destacado",      text: "Aparece al tope de la búsqueda y el feed del Barrio en tu área durante una semana. Visibilidad premium, precio accesible.", badge: "desde $5/semana" },
    { e: "💼", title: "Chambas",        text: "Encuentra trabajos patrocinados de negocios que buscan tus habilidades. Aplica directamente desde la app.", badge: "Incluido" },
  ];
  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-50" data-testid="v8-tools-section">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-10">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl" style={{ color: COLORS.navy }}>
            {t ? "Tools to grow" : "Herramientas para crecer"}
          </h2>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <article
              key={i}
              className="rounded-2xl bg-white border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition"
              data-testid={`v8-tool-card-${i}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-3xl">{c.e}</span>
                <span
                  className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                  style={{ background: COLORS.light, color: COLORS.navy }}
                >
                  {c.badge}
                </span>
              </div>
              <h3 className="font-display font-bold text-lg" style={{ color: COLORS.navy }}>{c.title}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{c.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── §5 Reach further ──────────────────────────────────────────────
function ReachSection({ lang }) {
  const t = lang === "en";
  const stats = t ? [
    { n: "160 mi", l: "Max service radius" },
    { n: "50+",    l: "US cities with active providers" },
    { n: "2 hrs",  l: "Average travel distance for premium jobs" },
  ] : [
    { n: "160 mi", l: "Radio máximo de servicio" },
    { n: "50+",    l: "Ciudades de USA con proveedores activos" },
    { n: "2 hrs",  l: "Distancia promedio que viajan los pros para proyectos grandes" },
  ];
  return (
    <section
      className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8"
      style={{ background: COLORS.light }}
      data-testid="v8-reach-section"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl leading-tight" style={{ color: COLORS.navy }}>
              {t
                ? "Your services, visible up to 160 miles away"
                : "Tus servicios, visibles hasta a 160 millas de distancia"}
            </h2>
            <p className="text-base text-slate-700 mt-3 leading-relaxed">
              {t
                ? "Most marketplaces limit you to your city. Getamano lets you set your service radius — 10, 25, 50, 100, or 160 miles. Because your clients don't always live next door."
                : "La mayoría de los marketplaces te limitan a tu ciudad. En Getamano puedes configurar tu radio de servicio — 10, 25, 50, 100 o 160 millas. Porque tus clientes no siempre están a la vuelta de la esquina."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white p-4 text-center shadow-sm"
                data-testid={`v8-reach-stat-${i}`}
              >
                <p className="font-display font-extrabold text-2xl sm:text-3xl" style={{ color: COLORS.blue }}>{s.n}</p>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── §6 The complete ecosystem table ──────────────────────────────
function EcosystemSection({ lang }) {
  const t = lang === "en";
  const rows = [
    { f: t ? "Search & browse services" : "Buscar y explorar servicios", free: "✅", v: "✅" },
    { f: t ? "Post in Barrio feed"      : "Publicar en el feed del Barrio", free: "✅", v: t ? "✅ + Verified badge" : "✅ + Badge verificado" },
    { f: "Stories",                                                       free: "✅", v: t ? "✅ + \"View eCard\" CTA" : "✅ + CTA \"Ver eCard\"" },
    { f: t ? "eCard (digital profile)"  : "eCard (perfil digital)",       free: "❌", v: "✅" },
    { f: t ? "Portfolio (up to 12 photos)" : "Portafolio (hasta 12 fotos)", free: "❌", v: "✅" },
    { f: t ? "Reels (short videos)"     : "Reels (videos cortos)",        free: "❌", v: "✅" },
    { f: t ? "Trust Score (public)"     : "Índice de Confianza (público)", free: "❌", v: "✅" },
    { f: t ? "GM-XXXX verification code": "Código GM-XXXX",               free: "❌", v: "✅" },
    { f: t ? "Lead alerts (instant push)" : "Alertas de leads (push instantáneo)", free: "❌", v: "✅" },
    { f: t ? "Featured placement"       : "Destacado",                    free: "❌", v: "+$5/" + (t ? "week" : "semana") },
    { f: t ? "Sponsored Chambas"        : "Chambas patrocinadas",         free: "❌", v: "✅" },
    { f: t ? "Physical business card"   : "Tarjeta física de negocio",    free: "❌", v: "+$20 " + (t ? "one-time" : "una vez") },
    { f: t ? "Gremio posting (trade network)" : "Publicación en Gremios", free: t ? "View only" : "Solo ver", v: t ? "✅ Full access" : "✅ Acceso total" },
    { f: t ? "Referral earnings"        : "Comisiones por referidos",     free: "❌", v: t ? "✅ $7/referral" : "✅ $7/referido" },
  ];
  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8" data-testid="v8-ecosystem-section">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-8">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl" style={{ color: COLORS.navy }}>
            {t ? "The complete ecosystem" : "El ecosistema completo"}
          </h2>
        </header>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm" data-testid="v8-ecosystem-table">
            <thead>
              <tr style={{ background: COLORS.blue, color: "white" }}>
                <th className="text-left px-4 py-3 font-bold">{t ? "Feature" : "Función"}</th>
                <th className="text-left px-4 py-3 font-bold whitespace-nowrap">{t ? "Free user" : "Usuario gratis"}</th>
                <th className="text-left px-4 py-3 font-bold whitespace-nowrap">
                  {t ? "Verified · $10/mo" : "Verificado · $10/mes"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-50/50" : ""}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.f}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.free === "✅" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" /> :
                     r.free === "❌" ? <X className="w-4 h-4 text-slate-300 inline" /> :
                     r.free}
                  </td>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: COLORS.navy }}>
                    {r.v.startsWith("✅") ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>{r.v.replace(/^✅\s?/, "")}</span>
                      </span>
                    ) : r.v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── §7 Who we are ─────────────────────────────────────────────────
function WhoSection({ lang }) {
  const t = lang === "en";
  const stats = t ? ["1 plan · No confusing tiers", "GM-XXXX · Your verified identity", "$10/mo · Everything included"]
                 : ["1 plan · Sin tiers complicados", "GM-XXXX · Tu identidad verificada", "$10/mes · Todo incluido"];
  return (
    <section
      className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8"
      style={{ background: COLORS.navy, color: "white" }}
      data-testid="v8-who-section"
    >
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl leading-tight">
          {t ? "Built with Latino heart — open to everyone." : "Con corazón latino — abierto para todos."}
        </h2>
        <p className="text-base sm:text-lg mt-4 leading-relaxed" style={{ color: COLORS.sky }}>
          {t
            ? "Getamano was born from the Latin community — the energy, the work ethic, the pride in a job well done. But skilled professionals and the people who need them come from everywhere. Our platform is for anyone who values quality, trust, and community."
            : "Getamano nació de la comunidad latina — la energía, el trabajo, el orgullo de hacer bien las cosas. Pero los mejores profesionales y quienes los necesitan vienen de todas partes. Esta plataforma es para quien valora la calidad, la confianza y la comunidad."}
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {stats.map((s, i) => (
            <li
              key={i}
              className="px-4 h-10 inline-flex items-center rounded-full text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              {s}
            </li>
          ))}
        </ul>
        <p
          className="font-display font-extrabold text-2xl sm:text-3xl mt-8"
          style={{ color: COLORS.cyan }}
          data-testid="v8-who-tagline"
        >
          Lo latino, a la mano.
        </p>
      </div>
    </section>
  );
}

// ─── §8 Final CTA ──────────────────────────────────────────────────
function FinalCtaSection({ lang }) {
  const t = lang === "en";
  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8" data-testid="v8-final-cta">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl" style={{ color: COLORS.navy }}>
          {t ? "Ready to join the community?" : "¿Listo para unirte a la comunidad?"}
        </h2>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="h-12 px-6 rounded-full font-bold inline-flex items-center justify-center gap-2 text-white active:scale-95 transition"
            style={{ background: COLORS.blue }}
            data-testid="v8-cta-find"
          >
            {t ? "Find a provider" : "Encontrar un proveedor"} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="h-12 px-6 rounded-full font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition border-2"
            style={{ borderColor: COLORS.blue, color: COLORS.navy }}
            data-testid="v8-cta-list"
          >
            {t ? "List your services" : "Ofrecer tus servicios"} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
