/**
 * CityscapeBackdrop — CSS-only skyline used behind the entry screens
 * (Register, Onboarding Splash + Slides, Login).
 *
 * Pure CSS — no SVG asset, no images, no JS. Three layers stacked:
 *   1. Sky gradient (top → bottom: navy → ocean → light cyan).
 *   2. Sun / city-glow halo behind the buildings.
 *   3. Two parallax rows of buildings (back row darker + smaller,
 *      front row lighter + taller). Buildings are pure <div>s with
 *      varying heights, widths and "window" backgrounds painted via
 *      `background-image: repeating-linear-gradient(...)`.
 *
 * Mobile-first:
 *   - `position: fixed; inset: 0;` so the backdrop NEVER causes
 *     horizontal scroll on tight viewports (the prior register screen
 *     overflowed because flex centring with a fixed-width image kept
 *     pushing the layout > 100vw).
 *   - `pointer-events: none` so taps go through to the form on top.
 *   - `overflow: hidden` on the container clips any sub-pixel rounding
 *     from the buildings or sun gradient.
 *
 * Color palette matches the Ocean Blue system:
 *   #03045E (deep navy, sky top + back buildings)
 *   #0077B6 (ocean blue, mid sky + back row glow)
 *   #00B4D8 (turquoise, sun centre)
 *   #90E0EF (light sky-blue, front row windows)
 *   #CAF0F8 (very light, page bg fallback)
 */
export default function CityscapeBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
      data-testid="cityscape-backdrop"
    >
      <style>{`
        @keyframes gtm-sun-pulse {
          0%, 100% { opacity: 0.85; transform: translate(-50%, 0) scale(1); }
          50%      { opacity: 1;    transform: translate(-50%, 0) scale(1.04); }
        }
        @keyframes gtm-twinkle {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        @keyframes gtm-cloud {
          0%   { transform: translateX(-20%); }
          100% { transform: translateX(120%); }
        }
        .gtm-cityscape {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              180deg,
              #03045E 0%,
              #023E8A 35%,
              #0077B6 60%,
              #00B4D8 78%,
              #CAF0F8 100%
            );
        }
        .gtm-sun {
          position: absolute;
          left: 50%;
          bottom: 24%;
          width: min(70vw, 360px);
          height: min(70vw, 360px);
          transform: translate(-50%, 0);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(0,180,216,0.4) 35%, rgba(0,180,216,0) 70%);
          filter: blur(2px);
          animation: gtm-sun-pulse 6s ease-in-out infinite;
        }
        .gtm-star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: white;
          border-radius: 50%;
          animation: gtm-twinkle 3s ease-in-out infinite;
        }
        .gtm-cloud {
          position: absolute;
          height: 4px;
          background: rgba(202, 240, 248, 0.6);
          border-radius: 999px;
          filter: blur(1px);
        }
        .gtm-skyline {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 0;
        }
        .gtm-bldg {
          flex-shrink: 0;
          border-radius: 6px 6px 0 0;
          /* Solid building silhouette */
          background-color: var(--bldg-bg, #03045E);
          /* Windows: two repeating-linear-gradient layers painted on top,
             one for rows + one for columns. Each window is a small light
             cyan square. */
          background-image:
            repeating-linear-gradient(
              0deg,
              transparent 0,
              transparent var(--win-row, 12px),
              rgba(202, 240, 248, var(--win-alpha, 0.45)) var(--win-row, 12px),
              rgba(202, 240, 248, var(--win-alpha, 0.45)) calc(var(--win-row, 12px) + 4px)
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0,
              transparent var(--win-col, 10px),
              rgba(202, 240, 248, var(--win-alpha, 0.45)) var(--win-col, 10px),
              rgba(202, 240, 248, var(--win-alpha, 0.45)) calc(var(--win-col, 10px) + 4px)
            );
          background-blend-mode: screen, screen;
        }
        .gtm-bldg.spire::after {
          content: "";
          position: absolute;
          left: 50%;
          top: -22px;
          width: 2px;
          height: 22px;
          background: rgba(255, 255, 255, 0.65);
          transform: translateX(-50%);
        }
      `}</style>

      {/* 1. sky gradient */}
      <div className="gtm-cityscape" />

      {/* 2. sun / city glow */}
      <div className="gtm-sun" />

      {/* 3. twinkling stars (top portion only) */}
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="gtm-star"
          style={{
            top: `${(i * 53) % 30 + 3}%`,
            left: `${(i * 73) % 100}%`,
            animationDelay: `${(i % 7) * 0.35}s`,
            opacity: 0.7,
          }}
        />
      ))}

      {/* 4. drifting clouds */}
      <span
        className="gtm-cloud"
        style={{
          top: "12%",
          left: 0,
          width: "120px",
          animation: "gtm-cloud 45s linear infinite",
          animationDelay: "-12s",
        }}
      />
      <span
        className="gtm-cloud"
        style={{
          top: "22%",
          left: 0,
          width: "80px",
          animation: "gtm-cloud 60s linear infinite",
          animationDelay: "-30s",
        }}
      />

      {/* 5. BACK skyline row — distant silhouettes, mid-blue */}
      <div
        className="gtm-skyline"
        style={{ filter: "blur(0.5px)", opacity: 0.95 }}
      >
        {BACK_ROW.map((b, i) => (
          <div
            key={`b-${i}`}
            className={`gtm-bldg relative ${b.spire ? "spire" : ""}`}
            style={{
              width: b.w,
              height: b.h,
              marginRight: b.gap || 0,
              "--bldg-bg": "#03045E",
              "--win-row": "10px",
              "--win-col": "8px",
              "--win-alpha": "0.55",
            }}
          />
        ))}
      </div>

      {/* 6. FRONT skyline row — closer, lit-up ocean-blue buildings */}
      <div className="gtm-skyline" style={{ opacity: 1 }}>
        {FRONT_ROW.map((b, i) => (
          <div
            key={`f-${i}`}
            className={`gtm-bldg relative ${b.spire ? "spire" : ""}`}
            style={{
              width: b.w,
              height: b.h,
              marginRight: b.gap || 0,
              "--bldg-bg": "#023E8A",
              "--win-row": "12px",
              "--win-col": "10px",
              "--win-alpha": "0.65",
            }}
          />
        ))}
      </div>

      {/* 7. Subtle bottom fade — keeps buildings visible while still
            blending softly into the light bg below them. */}
      <div
        className="absolute inset-x-0 bottom-0 h-12"
        style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(202,240,248,0.5) 100%)",
        }}
      />
    </div>
  );
}

/**
 * Layout arrays. Heights/widths use VW units so they scale with the
 * viewport — buildings stay proportional on every device without
 * causing horizontal overflow.
 */
const BACK_ROW = [
  { w: "8vw", h: "14vh" },
  { w: "6vw", h: "18vh", spire: true },
  { w: "10vw", h: "12vh" },
  { w: "7vw", h: "20vh", spire: true },
  { w: "5vw", h: "16vh" },
  { w: "9vw", h: "22vh" },
  { w: "6vw", h: "15vh" },
  { w: "8vw", h: "19vh" },
  { w: "7vw", h: "13vh" },
  { w: "10vw", h: "17vh" },
  { w: "6vw", h: "14vh" },
  { w: "5vw", h: "18vh", spire: true },
  { w: "9vw", h: "12vh" },
  { w: "7vw", h: "20vh" },
];

const FRONT_ROW = [
  { w: "10vw", h: "10vh" },
  { w: "8vw", h: "16vh" },
  { w: "12vw", h: "12vh" },
  { w: "7vw", h: "18vh" },
  { w: "10vw", h: "9vh" },
  { w: "14vw", h: "20vh", spire: true },
  { w: "8vw", h: "11vh" },
  { w: "11vw", h: "15vh" },
  { w: "9vw", h: "13vh" },
  { w: "12vw", h: "17vh" },
  { w: "8vw", h: "10vh" },
  { w: "11vw", h: "14vh" },
];
