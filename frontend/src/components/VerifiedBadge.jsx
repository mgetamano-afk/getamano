import { memo } from "react";

/**
 * VerifiedBadge — Section 89 v8.
 *
 * Brand-specific verified-provider badge. Replaces the generic
 * Lucide `<ShieldCheck>` icon everywhere we surface "this provider is
 * verified by getamano". Uses the custom xolo-on-shield artwork
 * uploaded by the user at `/verify-badge.png` (with smaller variants
 * pre-rendered at 64/128/256 px for performance).
 *
 * Props:
 *   size    — number of pixels for the rendered square. Defaults to 16.
 *   label   — optional text rendered after the badge ("Verificado").
 *   variant — "icon" (default) | "pill" (rounded chip w/ background).
 *   className — extra Tailwind classes for the wrapping span.
 *
 * Usage NOTE: this is the **only** place that should pull the
 * verify-badge.png asset. If you ever need a verified visual,
 * import this component instead of dropping another <img>.
 */
function VerifiedBadgeBase({
  size = 16,
  label,
  variant = "icon",
  className = "",
  testid,
  ...rest
}) {
  // Pick the smallest pre-rendered variant that fits the requested
  // size to keep the rendered PNG sharp without shipping a 1MB asset.
  const srcVariant = size <= 24 ? 64 : size <= 64 ? 128 : 256;
  const src = `/verify-badge-${srcVariant}.png`;

  const img = (
    <img
      src={src}
      alt={label || "Verificado"}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size, flexShrink: 0 }}
      draggable={false}
      data-testid={testid || "verified-badge"}
    />
  );

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 h-6 rounded-full bg-[#E0F2FE] text-[#0077B6] text-[11px] font-bold ${className}`}
        {...rest}
      >
        {img}
        {label && <span>{label}</span>}
      </span>
    );
  }

  if (!label) return img;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} {...rest}>
      {img}
      <span>{label}</span>
    </span>
  );
}

const VerifiedBadge = memo(VerifiedBadgeBase);
export default VerifiedBadge;
