/**
 * Inclusive owner identity badge for getamano providers.
 *
 * Section 68 / C3 — STRATEGIC UPDATE: this badge is no longer rendered on
 * client-facing surfaces (Search, public eCard, Landing, SEO, CategoryHub,
 * ProvidersMap). The getamano brand is "Latino-built · America-wide" and
 * client-facing pages should be ethnically neutral.
 *
 * The badge now ONLY renders when the caller explicitly opts-in via
 * `forceShow={true}`. Internal surfaces that still want to surface the
 * identity (provider dashboard, admin panels) must pass that prop.
 *
 * Values: 'latino' | 'american' | null
 */
const STYLES = {
  latino: {
    bg: "#E1F5EE",
    color: "#025F67",
    border: "#A6E1DA",
    label: "Dueño Latino",
  },
  american: {
    bg: "#E6F1FB",
    color: "#185FA5",
    border: "#BFD9F2",
    label: "Dueño Americano",
  },
};

export default function OwnerIdentityBadge({ identity, size = "md", className = "", forceShow = false }) {
  // Client-facing default: render nothing. Section 68 / C3.
  if (!forceShow) return null;
  if (!identity || !STYLES[identity]) return null;
  const s = STYLES[identity];
  const sizeClass =
    size === "sm" ? "text-[10px] px-2 py-0.5" :
    size === "lg" ? "text-sm px-3 py-1.5" :
    "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass} ${className}`}
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
      data-testid={`owner-identity-${identity}`}
    >
      <span aria-hidden="true">🤝</span> {s.label}
    </span>
  );
}
