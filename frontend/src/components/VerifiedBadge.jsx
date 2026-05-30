import { memo } from "react";

/**
 * VerifiedBadge — V10 verifyv2 badge (Xolo + shield + check).
 *
 * Replaces the generic Lucide <ShieldCheck/> icon everywhere we surface
 * "this provider is verified by getamano". The PNG asset is pre-rendered
 * at 64/128/256 px at `/verify-badge-{size}.png` and the master master
 * lives at `/verify-badge.png`.
 *
 * Props:
 *   size      — number of pixels for the rendered square (defaults 16).
 *               Use the V10 spec: sm=16, md=22, lg=28.
 *   label     — optional text rendered after the badge (e.g. "Verificado").
 *   variant   — "icon" (default) | "pill" (rounded chip w/ background).
 *   code      — optional GM-XXXX getamano_code; included in the tooltip.
 *   darkBg    — when true, applies brightness boost (Reels / dark overlays).
 *   className — extra Tailwind classes for the wrapper span.
 *
 * Usage NOTE: this is the **only** place that should pull the
 * `verify-badge*.png` asset. If you need a verified visual, import this
 * component instead of dropping another <img>.
 */
function VerifiedBadgeBase({
  size = 16,
  label,
  variant = "icon",
  code,
  darkBg = false,
  className = "",
  testid,
  ...rest
}) {
  // Pick the smallest pre-rendered variant that fits the requested size
  // to keep the rendered PNG sharp without shipping the 512px master.
  const srcVariant = size <= 24 ? 64 : size <= 64 ? 128 : 256;
  const src = `/verify-badge-${srcVariant}.png`;

  // i18n-aware alt + tooltip (reads localStorage so the badge doesn't
  // need to be a context consumer).
  let lang = "es";
  try {
    if (typeof window !== "undefined") lang = window.localStorage.getItem("tx_lang") || "es";
  } catch { /* SSR/private mode safe */ }

  const altBase = lang === "en" ? "Verified by getamano" : "Verificado por getamano";
  const tooltip = code ? `${altBase} · ${code}` : altBase;

  const img = (
    <img
      src={src}
      alt={label || altBase}
      title={tooltip}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        ...(darkBg ? { filter: "brightness(1.3)" } : {}),
      }}
      draggable={false}
      data-testid={testid || "verified-badge"}
    />
  );

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 h-6 rounded-full bg-[#E0F2FE] text-[#0077B6] text-[11px] font-bold ${className}`}
        title={tooltip}
        {...rest}
      >
        {img}
        {label && <span>{label}</span>}
      </span>
    );
  }

  if (!label) return img;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={tooltip} {...rest}>
      {img}
      <span>{label}</span>
    </span>
  );
}

const VerifiedBadge = memo(VerifiedBadgeBase);
export default VerifiedBadge;
