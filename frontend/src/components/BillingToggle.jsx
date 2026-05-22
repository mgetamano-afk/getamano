import { Sparkles } from "lucide-react";

/**
 * BillingToggle — pill switch for monthly vs annual billing.
 *
 * Behaviour matches the spec in Section 26:
 *   • Two side-by-side options inside a single pill
 *   • Active option gets a white pill background + brand-color text
 *   • Inactive option is muted slate text on the pill background
 *   • Floating "AHORRA 17%" badge above "Anual" — same accent color as the brand orange
 *   • Animated indicator slides between the two states (CSS only)
 *
 * Props
 *   cycle: "monthly" | "annual"
 *   onChange(next): callback when user clicks
 *   lang:   "es" | "en"  (label localization)
 *   savingsLabel?: optional override (default 17%)
 */
export default function BillingToggle({ cycle, onChange, lang = "es", savingsLabel }) {
  const T = lang === "en" ? {
    monthly: "Monthly",
    annual: "Annual",
    save: `Save ${savingsLabel || "17%"}`,
  } : {
    monthly: "Mensual",
    annual: "Anual",
    save: `Ahorra ${savingsLabel || "17%"}`,
  };

  return (
    <div className="relative inline-flex items-center" data-testid="billing-toggle">
      {/* Outer pill */}
      <div
        className="relative inline-flex items-center rounded-full p-1 shadow-sm"
        style={{
          background: "rgba(2, 95, 103, 0.06)",
          border: "1px solid rgba(2, 95, 103, 0.12)",
        }}
      >
        {/* Sliding indicator — pure CSS, animated via transform */}
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 w-1/2 rounded-full bg-white shadow-md transition-transform duration-300 ease-out"
          style={{
            transform: cycle === "monthly" ? "translateX(0)" : "translateX(calc(100% - 2px))",
            left: 4,
            right: 4,
            // Border-radius matches the parent pill for visual continuity
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(2, 95, 103, 0.06)",
          }}
        />
        <button
          type="button"
          onClick={() => onChange("monthly")}
          className="relative z-10 px-5 sm:px-6 py-2.5 text-sm font-semibold rounded-full transition-colors"
          style={{ color: cycle === "monthly" ? "#025F67" : "#64748B" }}
          aria-pressed={cycle === "monthly"}
          data-testid="billing-toggle-monthly"
        >
          {T.monthly}
        </button>
        <button
          type="button"
          onClick={() => onChange("annual")}
          className="relative z-10 px-5 sm:px-6 py-2.5 text-sm font-semibold rounded-full transition-colors"
          style={{ color: cycle === "annual" ? "#025F67" : "#64748B" }}
          aria-pressed={cycle === "annual"}
          data-testid="billing-toggle-annual"
        >
          {T.annual}
        </button>
      </div>

      {/* Floating savings badge above the Annual half */}
      <span
        className="absolute -top-4 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-md"
        style={{
          background: "linear-gradient(135deg, #FF6B2C 0%, #F97316 100%)",
          color: "white",
          // hide on small screens where it overlaps; we add an inline label instead
        }}
        data-testid="billing-toggle-savings-badge"
      >
        <Sparkles className="w-2.5 h-2.5" /> {T.save}
      </span>
    </div>
  );
}
