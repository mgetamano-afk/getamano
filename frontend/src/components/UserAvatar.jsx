import { Link } from "react-router-dom";
import { getDicebearAvatar } from "../lib/avatar";

/**
 * UserAvatar — Section 47 — single source of truth for ALL avatar rendering.
 *
 * Priority order:
 *   1. avatarUrl (uploaded photo)
 *   2. avatarEmoji (single emoji chosen by user, rendered on a colored bg)
 *   3. dicebear avatar generated from businessName / name (legacy)
 *   4. plain initial on a colored circle (final fallback)
 *
 * `slug` is optional — when provided, the whole avatar becomes a link to
 * `/provider/{slug}` (eCard).
 */
const SIZE_CLASSES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
};

const EMOJI_BG = "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 100%)"; // soft amber for emoji
const INITIAL_BG = "linear-gradient(135deg, #025F67 0%, #2F9D94 100%)";

export default function UserAvatar({
  name,
  businessName,
  avatarUrl,
  avatarEmoji,
  slug,
  size = "md",
  className = "",
  testid,
  ringClass = "",
}) {
  const displayName = name || businessName || "Usuario";
  const initial = (displayName.trim().charAt(0) || "?").toUpperCase();
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const containerCls = `rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center font-bold ${sizeCls} ${ringClass} ${className}`;

  let inner;
  if (avatarUrl) {
    inner = (
      <img
        src={avatarUrl}
        alt={displayName}
        loading="lazy"
        className="w-full h-full object-cover"
      />
    );
  } else if (avatarEmoji) {
    inner = (
      <span
        className="w-full h-full flex items-center justify-center text-lg leading-none"
        style={{ background: EMOJI_BG }}
        aria-label={displayName}
      >
        {avatarEmoji}
      </span>
    );
  } else if (businessName) {
    // Legacy dicebear avatar — keeps existing posts visually consistent
    inner = (
      <img
        src={getDicebearAvatar(businessName)}
        alt={displayName}
        loading="lazy"
        className="w-full h-full object-cover"
      />
    );
  } else {
    inner = (
      <span
        className="w-full h-full flex items-center justify-center text-white"
        style={{ background: INITIAL_BG }}
        aria-label={displayName}
      >
        {initial}
      </span>
    );
  }

  if (slug) {
    return (
      <Link
        to={`/provider/${slug}`}
        className={containerCls}
        data-testid={testid}
        aria-label={`Ver eCard de ${displayName}`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span className={containerCls} data-testid={testid}>
      {inner}
    </span>
  );
}
