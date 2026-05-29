/**
 * FuturisticDecor — CSS-only decorative blobs/grid used across the
 * landing surfaces (AppHome hero, marketing sections, founding widget).
 *
 * Section 77 — Futuristic · Minimalista · Premium rebrand:
 *   · A large cyan circle (#00B4D8) at the top-right.
 *   · A blue blob (#0077B6) at the bottom-left.
 *   · A subtle 32px grid pattern overlaid via SVG.
 *   · An optional vertical accent line.
 *
 * All elements are absolutely positioned with `pointer-events: none`,
 * blurred and low-opacity so they never interfere with content. The
 * outer wrapper is `absolute inset-0 overflow-hidden`, meaning the
 * parent MUST be `relative + overflow-hidden` to clip the decor.
 *
 * Variant prop:
 *   "navy"   — for navy/dark gradient backgrounds (cyan & light-blue blurs)
 *   "light"  — for surface/white backgrounds (subtle blue washes)
 */
export default function FuturisticDecor({ variant = "navy", showGrid = true }) {
  const isNavy = variant === "navy";

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      data-testid="futuristic-decor"
    >
      {/* Top-right cyan circle */}
      <div
        className="absolute"
        style={{
          top: "-6rem",
          right: "-6rem",
          width: "min(70vw, 320px)",
          height: "min(70vw, 320px)",
          borderRadius: "9999px",
          background: isNavy ? "rgba(0, 180, 216, 0.22)" : "rgba(0, 180, 216, 0.18)",
          filter: "blur(48px)",
        }}
      />
      {/* Bottom-left blue blob */}
      <div
        className="absolute"
        style={{
          bottom: "-4rem",
          left: "-4rem",
          width: "min(60vw, 280px)",
          height: "min(60vw, 280px)",
          borderRadius: "9999px",
          background: isNavy ? "rgba(0, 119, 182, 0.28)" : "rgba(0, 119, 182, 0.14)",
          filter: "blur(40px)",
        }}
      />
      {/* Subtle grid pattern (32px squares) */}
      {showGrid && (
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ opacity: isNavy ? 0.08 : 0.06 }}
        >
          <defs>
            <pattern id="gtm-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke={isNavy ? "#90E0EF" : "#0077B6"} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gtm-grid)" />
        </svg>
      )}
      {/* Vertical accent line — left side, gradient cyan→transparent */}
      <div
        className="absolute left-6 top-8 w-px h-24"
        style={{
          background: `linear-gradient(180deg, ${isNavy ? "rgba(0,180,216,0.7)" : "rgba(0,119,182,0.45)"} 0%, transparent 100%)`,
        }}
      />
    </div>
  );
}
