import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  CATEGORY_MAP,
  getSuggestedSubcategories,
  getOtherSubcategories,
} from "../data/categoryMap";

/**
 * SmartSubcategoryPicker — Section 40.
 *
 * Replaces the old "additional categories" wall-of-chips with a contextual
 * picker:
 *   1. "Especializaciones de {Limpieza}" — only the subs that belong to the
 *      currently-selected main category (teal accent).
 *   2. "Ver otras categorías (opcional)" — collapsed accordion containing
 *      every other sub, for cross-category providers.
 *   3. A teal summary box at the bottom listing what the provider picked.
 *
 * The selection model is an array of subcategory NAMES (strings) — exactly
 * the same shape the backend already stores in provider_profiles.additional_categories.
 */
export default function SmartSubcategoryPicker({
  mainCategory,
  selectedSubs = [],
  onChange,
}) {
  const [showOthers, setShowOthers] = useState(false);
  // Avoid the "clean irrelevant subs" effect firing on the *initial* mount —
  // otherwise we'd wipe pre-existing subs that the provider already saved.
  const isFirstRun = useRef(true);

  const suggested = useMemo(() => getSuggestedSubcategories(mainCategory), [mainCategory]);
  const others = useMemo(() => getOtherSubcategories(mainCategory), [mainCategory]);

  // When mainCategory changes, drop selected subs that no longer belong + collapse the accordion.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setShowOthers(false);
    const allValid = new Set(Object.values(CATEGORY_MAP).flat());
    const stillRelevant = selectedSubs.filter((s) => allValid.has(s));
    if (stillRelevant.length !== selectedSubs.length) {
      onChange(stillRelevant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainCategory]);

  const toggle = (sub) => {
    if (selectedSubs.includes(sub)) {
      onChange(selectedSubs.filter((s) => s !== sub));
    } else {
      onChange([...selectedSubs, sub]);
    }
  };

  if (!mainCategory || !CATEGORY_MAP[mainCategory]) {
    return (
      <div
        className="text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4"
        data-testid="smart-subpicker-empty"
      >
        Selecciona una <strong className="text-slate-700">categoría principal</strong> arriba para ver las especializaciones disponibles.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="smart-subpicker">
      {/* Sugeridas */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5" style={{ color: "#03045E" }} />
          <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#03045E" }}>
            Especializaciones de {mainCategory}
          </h4>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="smart-subpicker-suggested">
          {suggested.map((sub) => {
            const isSelected = selectedSubs.includes(sub);
            return (
              <button
                key={sub}
                type="button"
                onClick={() => toggle(sub)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                  isSelected
                    ? "text-white shadow-sm scale-[1.03]"
                    : "bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100"
                }`}
                style={isSelected ? { background: "#03045E" } : undefined}
                data-testid={`smart-sub-${sub.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}
                aria-pressed={isSelected}
              >
                {isSelected ? "✓ " : ""}{sub}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggle "otras" */}
      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowOthers((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          data-testid="smart-subpicker-toggle-others"
          aria-expanded={showOthers}
        >
          {showOthers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showOthers ? "Ocultar otras categorías" : "Ver otras categorías (opcional)"}
        </button>

        {showOthers && (
          <div className="mt-3 space-y-2" data-testid="smart-subpicker-others">
            <p className="text-xs text-slate-500">
              ¿Ofreces servicios en otras áreas? Puedes agregarlas aquí.
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
              {others.map((sub) => {
                const isSelected = selectedSubs.includes(sub);
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => toggle(sub)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                      isSelected
                        ? "bg-slate-700 text-white"
                        : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                    }`}
                    data-testid={`smart-sub-other-${sub.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? "✓ " : ""}{sub}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {selectedSubs.length > 0 && (
        <div
          className="rounded-xl p-3"
          style={{ background: "#E1F5EE", border: "1px solid rgba(2,95,103,0.15)" }}
          data-testid="smart-subpicker-summary"
        >
          <p className="text-xs font-semibold mb-1" style={{ color: "#03045E" }}>
            {selectedSubs.length} especializaci{selectedSubs.length === 1 ? "ón" : "ones"} elegida{selectedSubs.length === 1 ? "" : "s"}:
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {selectedSubs.join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
