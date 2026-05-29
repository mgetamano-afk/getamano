/**
 * BrandMark — single source of truth for the getamano logo.
 *
 * Centralises every logo usage in the app so future visual tweaks (size
 * changes, drop-shadow, gradient overlay, animation, etc.) happen in ONE
 * place instead of 12+ component files.
 *
 * Props
 * ─────
 *   size     "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
 *            Maps to Tailwind w-N h-N classes. Default "md" (40px).
 *
 *   variant  "mark" | "full"
 *            "mark"   → /getamano-logo-mark.png (square Xolo icon, default)
 *            "full"   → /getamano-logo-full.png (1024×1024 for OG/share)
 *
 *   glow     bool — adds a soft drop-shadow halo (used on dark hero
 *            backgrounds like the Splash screen). Default false.
 *
 *   className   extra Tailwind/CSS classes appended after the size
 *               defaults. Useful for margins (mx-auto, mb-4…).
 *
 *   alt       Override the default alt text (rarely needed).
 *
 *   ...rest   Forwarded to <img> (e.g. draggable, onError, loading).
 */
const SIZE_CLASS = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-16 h-16",
  "2xl": "w-24 h-24",
};

const SRC_BY_VARIANT = {
  mark: "/getamano-logo-mark.png",
  full: "/getamano-logo-full.png",
};

export default function BrandMark({
  size = "md",
  variant = "mark",
  glow = false,
  className = "",
  alt = "getamano",
  ...rest
}) {
  const sizeCls = SIZE_CLASS[size] || SIZE_CLASS.md;
  const glowCls = glow ? "drop-shadow-[0_4px_24px_rgba(255,255,255,0.45)]" : "";
  return (
    <img
      src={SRC_BY_VARIANT[variant] || SRC_BY_VARIANT.mark}
      alt={alt}
      className={`${sizeCls} object-contain flex-shrink-0 ${glowCls} ${className}`.trim()}
      {...rest}
    />
  );
}
