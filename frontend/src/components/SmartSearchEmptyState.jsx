import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ArrowRight, MessageSquarePlus, Sparkles, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * SmartSearchEmptyState — Section 27 "0 results" experience.
 *
 * When the search returned zero providers we:
 *   1. Acknowledge the empty state warmly (don't blame the user)
 *   2. Offer "Did you mean...?" alternatives by querying /api/search/alternatives
 *   3. Surface CTAs that turn a dead end into a growth opportunity:
 *      • "Invita un proveedor" → builds the catalog
 *      • "Explora todos los servicios" → safe fallback to /buscar
 *
 * Props:
 *   q, city        — what the user typed (for context messaging)
 *   onSuggestionClick(label) — called when user picks an alternative
 */
export default function SmartSearchEmptyState({ q, city, onSuggestionClick }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [alternatives, setAlternatives] = useState([]);
  const [loadingAlts, setLoadingAlts] = useState(false);

  useEffect(() => {
    if (!q || q.trim().length < 2) {
      setAlternatives([]);
      return;
    }
    setLoadingAlts(true);
    api.get("/search/alternatives", { params: { q } })
      .then((r) => setAlternatives(r.data?.alternatives || []))
      .catch(() => setAlternatives([]))
      .finally(() => setLoadingAlts(false));
  }, [q]);

  const T = lang === "en" ? {
    title: q
      ? `We couldn't find providers for "${q}"${city ? ` in ${city}` : ""} yet`
      : "No providers match these filters",
    hint: "We're still growing — try a different word or invite the kind of provider you need.",
    didYouMean: "Did you mean…",
    invitePro: "Invite a provider",
    inviteProBody: "Know someone who offers this? Send them an invite and they get the founding-member badge.",
    inviteCta: "Send the invite",
    exploreAll: "Explore all services",
  } : {
    title: q
      ? `Aún no encontramos proveedores para "${q}"${city ? ` en ${city}` : ""}`
      : "Ningún proveedor coincide con estos filtros",
    hint: "Estamos creciendo — prueba con otra palabra o invita al proveedor que necesitas.",
    didYouMean: "¿Quisiste decir…",
    invitePro: "Invita un proveedor",
    inviteProBody: "¿Conoces a alguien que ofrezca esto? Envíale una invitación y se gana el badge de miembro fundador.",
    inviteCta: "Enviar invitación",
    exploreAll: "Explorar todos los servicios",
  };

  const handleSuggestion = (label) => {
    if (onSuggestionClick) onSuggestionClick(label);
    else {
      const p = new URLSearchParams();
      p.set("q", label);
      if (city) p.set("city", city);
      navigate(`/buscar?${p.toString()}`);
    }
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center"
      data-testid="smart-search-empty-state"
    >
      <div
        className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "rgba(2,95,103,0.08)" }}
      >
        <Search className="w-7 h-7" style={{ color: "#03045E" }} />
      </div>

      <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900 leading-snug" data-testid="empty-state-title">
        {T.title}
      </h2>
      <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">{T.hint}</p>

      {/* Did-you-mean suggestions */}
      {!loadingAlts && alternatives.length > 0 && (
        <div className="mt-6" data-testid="empty-state-suggestions">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5 inline-flex items-center gap-1.5 justify-center">
            <Sparkles className="w-3.5 h-3.5" /> {T.didYouMean}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {alternatives.map((alt) => (
              <button
                key={alt}
                type="button"
                onClick={() => handleSuggestion(alt)}
                className="px-4 py-2 rounded-full text-sm font-medium transition border"
                style={{ background: "rgba(2,95,103,0.06)", borderColor: "rgba(2,95,103,0.18)", color: "#03045E" }}
                data-testid={`empty-state-suggestion-${alt}`}
              >
                {alt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Invite-a-provider growth CTA */}
      <div
        className="mt-7 rounded-2xl p-5 sm:p-6 text-left mx-auto max-w-md"
        style={{ background: "linear-gradient(135deg, rgba(255,107,44,0.06) 0%, rgba(2,95,103,0.05) 100%)", border: "1px dashed rgba(255,107,44,0.32)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg, #FF6B2C 0%, #F97316 100%)" }}
          >
            <MessageSquarePlus className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm">{T.invitePro}</p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{T.inviteProBody}</p>
            <Link
              to={`/registro?intent=provider&ref=invite${q ? `&for=${encodeURIComponent(q)}` : ""}`}
              className="inline-flex mt-3 items-center gap-1.5 px-5 py-3 rounded-full text-white text-xs font-bold hover:scale-[1.02] active:scale-[0.98] transition"
              style={{ background: "linear-gradient(135deg, #FF6B2C 0%, #F97316 100%)", minHeight: 44 }}
              data-testid="empty-state-invite-cta"
            >
              {T.inviteCta} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Safe-fallback link */}
      <Link
        to="/buscar"
        className="inline-flex mt-5 items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900"
        data-testid="empty-state-explore-all"
      >
        <MapPin className="w-4 h-4" /> {T.exploreAll}
      </Link>
    </div>
  );
}
