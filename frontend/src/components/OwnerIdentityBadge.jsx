/**
 * Inclusive owner identity badge for getamano providers.
 * Replaces all country flag badges. Values: 'latino' | 'american' | null
 * Null/undefined → renders nothing (clean profile).
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

export default function OwnerIdentityBadge({ identity, size = "md", className = "" }) {
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
