import { Link } from "react-router-dom";
import { ShieldCheck, Globe, Sun } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";

/**
 * ProviderCTASection — Section 34 (Inclusive Providers).
 *
 * Two side-by-side cards near the bottom of the landing inviting both
 * Latino *and* American (English-speaking) providers to join. The English
 * card converts the existing implicit assumption that Getamano is only
 * for Latino providers — anyone who serves the Latino community is welcome.
 *
 * Adapted to getamano's existing light palette (Alabaster + teal + sky blue
 * accents) instead of the prompt's dark-mode literal, to stay visually
 * consistent with the rest of the public site.
 *
 * Closing line: "El sol sale para todos" — the unifying message.
 */
export default function ProviderCTASection() {
  const { lang } = useI18n();

  return (
    <section
      className="px-4 sm:px-6 lg:px-8 py-14 md:py-20 max-w-5xl mx-auto"
      data-testid="provider-cta-section"
    >
      <div className="text-center mb-8">
        <span className="inline-block text-[10px] uppercase tracking-widest font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
          {lang === "en" ? "Provider invitation" : "Para proveedores"}
        </span>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 mt-3 tracking-tight">
          {lang === "en" ? "Do you offer a service?" : "¿Ofreces un servicio?"}
        </h2>
        <p className="text-slate-500 mt-2 max-w-xl mx-auto text-sm">
          {lang === "en"
            ? "Getamano is for everyone who wants to work and be found by the Latino community in the United States."
            : "Getamano es para todos los que quieren trabajar y ser encontrados por la comunidad latina en Estados Unidos."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CARD 1 — Latino provider (Spanish) */}
        <div
          className="rounded-2xl p-6 sm:p-7 flex flex-col"
          style={{
            background: "linear-gradient(135deg, rgba(2,95,103,0.05) 0%, rgba(47,157,148,0.12) 100%)",
            border: "1px solid rgba(2,95,103,0.20)",
          }}
          data-testid="provider-cta-latino"
        >
          <div className="text-3xl mb-3" aria-hidden="true">🇲🇽</div>
          <h3 className="font-display font-bold text-slate-900 text-lg leading-tight">
            Eres latino y ofreces un servicio
          </h3>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Eres electricista, limpias casas, cocinas, cuidas niños o construyes — y quieres que tu comunidad te encuentre fácil. Getamano es tu plataforma.
          </p>
          <ul className="text-sm text-slate-700 space-y-1.5 mt-4">
            <li className="flex items-start gap-2">
              <Globe className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#025F67" }} />
              Perfil en español e inglés
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#025F67" }} />
              Verificación de identidad incluida
            </li>
            <li className="flex items-start gap-2">
              <Sun className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#025F67" }} />
              Clientes que ya hablan tu idioma
            </li>
          </ul>
          <Link
            to="/registro?intent=provider&lang=es"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 py-3 px-5 rounded-2xl text-white font-bold transition active:scale-[0.98] shadow-sm"
            style={{ background: "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)" }}
            data-testid="provider-cta-latino-button"
          >
            Crear mi eCard gratis →
          </Link>
        </div>

        {/* CARD 2 — American provider (English) */}
        <div
          className="rounded-2xl p-6 sm:p-7 flex flex-col"
          style={{
            background: "linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(56,189,248,0.12) 100%)",
            border: "1px solid rgba(30,64,175,0.20)",
          }}
          data-testid="provider-cta-american"
        >
          <div className="text-3xl mb-3" aria-hidden="true">🇺🇸</div>
          <h3 className="font-display font-bold text-slate-900 text-lg leading-tight">
            You&apos;re American and serve Latino families
          </h3>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            You&apos;re a plumber, contractor, tutor, or landscaper — and you already work with Latino families. List your services where they&apos;re already looking.
          </p>
          <ul className="text-sm text-slate-700 space-y-1.5 mt-4">
            <li className="flex items-start gap-2">
              <Globe className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#1E40AF" }} />
              Profile in English &amp; Spanish
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#1E40AF" }} />
              Verified badge builds trust fast
            </li>
            <li className="flex items-start gap-2">
              <Sun className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#1E40AF" }} />
              Reach thousands of Latino clients
            </li>
          </ul>
          <Link
            to="/registro?intent=provider&lang=en"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 py-3 px-5 rounded-2xl text-white font-bold transition active:scale-[0.98] shadow-sm"
            style={{ background: "linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)" }}
            data-testid="provider-cta-american-button"
          >
            Create my free eCard →
          </Link>
        </div>
      </div>

      <p className="text-center text-sm text-slate-500 italic mt-6 max-w-xl mx-auto" data-testid="provider-cta-tagline">
        {lang === "en"
          ? "“The sun rises for everyone.” At Getamano, any good provider has a place. What matters is the work done well."
          : "“El sol sale para todos.” En Getamano, cualquier buen proveedor tiene un lugar. Lo que importa es el trabajo bien hecho."}
      </p>
    </section>
  );
}
