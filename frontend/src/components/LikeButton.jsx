import { useState, useRef, useEffect } from "react";
import { Heart, Sparkles } from "lucide-react";

/**
 * LikeButton — Section 61 + 78 enhancements.
 *
 * Beautiful, reusable like button with celebratory animation:
 *   - Heart pulse (scale 1 → 1.5 → 1.1 → 1.3 → 1) with color burst (gray → pink → red)
 *   - 6 floating heart particles burst radially outward and fade (default)
 *   - "+1" floating number rises + fades
 *   - Subtle haptic on supported devices
 *   - Optimistic-friendly: parent updates `count` after API → animation re-triggers
 *
 * NEW (Section 78) — `celebrationLevel` prop:
 *   "default" (regular posts): 6 hearts particles + heart pulse + "+1"
 *   "milestone" (community milestone posts): 10 hearts + 4 sparkles + warm
 *     color palette (pink/amber/orange) + longer animation duration. Used
 *     to make liking a milestone feel viscerally special.
 *
 * Used everywhere the user can express a like on getamano (Banner Gallery,
 * Banner of the Week, eCard saves, Community posts, Stories, etc.).
 */
const SIZES = {
  sm: { icon: "w-3.5 h-3.5", text: "text-xs",  padX: "px-2.5", h: "h-7",  gap: "gap-1" },
  md: { icon: "w-4 h-4",     text: "text-sm",  padX: "px-4",   h: "h-10", gap: "gap-1.5" },
  lg: { icon: "w-5 h-5",     text: "text-base", padX: "px-5",  h: "h-12", gap: "gap-2" },
};

let _particleIdCounter = 0;

export default function LikeButton({
  liked = false,
  count = 0,
  onClick,
  disabled = false,
  size = "md",
  showCount = true,
  variant = "pill",
  testid = "like-button",
  ariaLabel,
  disabledTitle,
  className = "",
  celebrationLevel = "default",  // 'default' | 'milestone'
}) {
  const s = SIZES[size] || SIZES.md;
  const [particles, setParticles] = useState([]);
  const [sparkles, setSparkles] = useState([]);
  const [floatPlus, setFloatPlus] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevLikedRef = useRef(liked);

  // Trigger celebration when liked transitions false → true (e.g. server confirmed)
  useEffect(() => {
    if (!prevLikedRef.current && liked) {
      celebrate();
    }
    prevLikedRef.current = liked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liked]);

  const isMilestone = celebrationLevel === "milestone";
  const heartCount = isMilestone ? 10 : 6;
  const sparkleCount = isMilestone ? 4 : 0;

  const celebrate = () => {
    setPulse(true);
    setFloatPlus(true);
    // Heart particles — milestone has a warmer color palette
    const palette = isMilestone
      ? ["#F43F5E", "#F59E0B", "#FB923C", "#EC4899", "#F43F5E"]
      : ["#F43F5E"];
    const newParticles = Array.from({ length: heartCount }, (_, i) => {
      const angle = (i * (360 / heartCount) - 90) + (Math.random() * 30 - 15);
      const distance = (isMilestone ? 36 : 28) + Math.random() * 16;
      const rad = (angle * Math.PI) / 180;
      return {
        id: ++_particleIdCounter,
        dx: Math.cos(rad) * distance,
        dy: Math.sin(rad) * distance,
        delay: Math.random() * 80,
        scale: 0.55 + Math.random() * 0.55,
        color: palette[i % palette.length],
      };
    });
    setParticles((cur) => [...cur, ...newParticles]);
    // Sparkles only for milestone
    if (isMilestone) {
      const newSparkles = Array.from({ length: sparkleCount }, () => {
        const angle = Math.random() * 360;
        const distance = 22 + Math.random() * 18;
        const rad = (angle * Math.PI) / 180;
        return {
          id: ++_particleIdCounter,
          dx: Math.cos(rad) * distance,
          dy: Math.sin(rad) * distance,
          delay: 100 + Math.random() * 120,
          scale: 0.7 + Math.random() * 0.4,
        };
      });
      setSparkles((cur) => [...cur, ...newSparkles]);
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(isMilestone ? [10, 30, 18] : 15); } catch { /* ignore */ }
    }
    setTimeout(() => setPulse(false), isMilestone ? 900 : 700);
    setTimeout(() => setFloatPlus(false), isMilestone ? 1400 : 1100);
    setTimeout(() => {
      setParticles((cur) => cur.filter((p) => !newParticles.some((np) => np.id === p.id)));
    }, isMilestone ? 1200 : 900);
    if (isMilestone) {
      setTimeout(() => setSparkles([]), 1400);
    }
  };

  const handleClick = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (!liked) celebrate(); // optimistic
    if (typeof onClick === "function") onClick(e);
  };

  let containerCls = "";
  if (variant === "pill") {
    containerCls = `inline-flex items-center ${s.gap} ${s.h} ${s.padX} rounded-full border transition-all duration-200 ${
      liked
        ? "bg-rose-50 border-rose-200 text-rose-600"
        : "bg-white border-slate-200 text-slate-600 hover:border-rose-200 hover:text-rose-500"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95"}`;
  } else if (variant === "ghost") {
    containerCls = `inline-flex items-center ${s.gap} ${s.h} ${s.padX} rounded-full transition-all duration-200 ${
      liked ? "text-rose-600" : "text-slate-500 hover:text-rose-500"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95"}`;
  } else if (variant === "floating") {
    containerCls = `inline-flex items-center ${s.gap} h-9 px-3 rounded-full bg-white/95 backdrop-blur shadow-md transition-all ${
      liked ? "text-rose-600" : "text-slate-600 hover:text-rose-500"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95"}`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={liked}
      aria-label={ariaLabel || (liked ? "Unlike" : "Like")}
      title={disabled && disabledTitle ? disabledTitle : undefined}
      className={`${containerCls} ${className} gtm-like-btn relative overflow-visible`}
      data-testid={testid}
      data-liked={liked ? "1" : "0"}
    >
      <span className="relative inline-flex items-center justify-center">
        <Heart
          className={`${s.icon} transition-colors duration-200 gtm-heart ${pulse ? "is-pulsing" : ""} ${liked ? "fill-rose-500 text-rose-500" : ""}`}
          aria-hidden="true"
        />

        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute inset-0 flex items-center justify-center pointer-events-none gtm-heart-particle"
            style={{
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--scale": p.scale,
              animationDelay: `${p.delay}ms`,
            }}
            aria-hidden="true"
          >
            <Heart className={s.icon} style={{ fill: p.color || "#f43f5e", color: p.color || "#f43f5e" }} />
          </span>
        ))}

        {sparkles.map((p) => (
          <span
            key={p.id}
            className="absolute inset-0 flex items-center justify-center pointer-events-none gtm-heart-particle"
            style={{
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--scale": p.scale,
              animationDelay: `${p.delay}ms`,
            }}
            aria-hidden="true"
          >
            <Sparkles className={s.icon} style={{ color: "#FCD34D", fill: "#FCD34D" }} />
          </span>
        ))}

        {floatPlus && (
          <span
            className="absolute left-1/2 -translate-x-1/2 -top-1 pointer-events-none gtm-plus-one font-bold text-rose-500"
            style={{ fontSize: size === "lg" ? "16px" : size === "sm" ? "11px" : "13px" }}
            aria-hidden="true"
          >
            +1
          </span>
        )}
      </span>

      {showCount && (
        <span
          key={count}
          className={`${s.text} font-semibold tabular-nums gtm-like-count ${pulse ? "is-pulsing" : ""}`}
          data-testid={`${testid}-count`}
        >
          {count > 999 ? `${(count / 1000).toFixed(1)}K` : count}
        </span>
      )}
    </button>
  );
}
