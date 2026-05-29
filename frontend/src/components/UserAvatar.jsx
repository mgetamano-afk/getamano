import { Link } from "react-router-dom";
import { getDefaultAvatar, getDicebearAvatar } from "../lib/avatar";

/**
 * UserAvatar — Section 47 / Section 83 — single source of truth for ALL avatar rendering.
 *
 * Priority order:
 *   1. avatarUrl (uploaded photo / OAuth picture)
 *   2. avatarEmoji (single emoji chosen by user, rendered on a colored bg)
 *   3. getDefaultAvatar — illustrated portrait library (8 latino-diverse
 *      characters, deterministic per user_id/businessName + optional gender)
 *   4. <img onError> → DiceBear fallback (legacy)
 *   5. Plain initial on a colored circle (absolute final fallback)
 *
 * `slug` is optional — when provided, the whole avatar becomes a link to
 * `/provider/{slug}` (eCard).
 *
 * Section 83 — `gender` and `userId` props let callers steer the default
 * library assignment. When omitted we hash businessName/name for stability.
 */
const SIZE_CLASSES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
};

const EMOJI_BG = "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 100%)"; // soft amber for emoji
const INITIAL_BG = "linear-gradient(135deg, #03045E 0%, #0077B6 100%)";

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
  userId,        // for stable default-library hash
  gender,        // 'male' | 'female' | undefined
}) {
  const displayName = name || businessName || "Usuario";
  const initial = (displayName.trim().charAt(0) || "?").toUpperCase();
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const containerCls = `rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center font-bold ${sizeCls} ${ringClass} ${className}`;

  // Pre-compute the default illustrated avatar for this user — stable
  // across renders thanks to deterministic hash. Used both as the no-photo
  // primary and as the <img onError> fallback to avoid broken images when
  // the uploaded url 404s.
  const defaultAvatar = getDefaultAvatar({
    user_id: userId,
    name: businessName || name,
    gender,
  });

  let inner;
  if (avatarUrl) {
    inner = (
      <img
        src={avatarUrl}
        alt={displayName}
        loading="lazy"
        className="w-full h-full object-cover"
        onError={(e) => {
          // Uploaded photo failed → fall back to illustrated portrait. If
          // even that fails, fall back to DiceBear (handled by recursive
          // onError below). Triple-layered to guarantee no broken icon.
          if (e.currentTarget.dataset.fallbackStage !== "1") {
            e.currentTarget.dataset.fallbackStage = "1";
            e.currentTarget.src = defaultAvatar;
          } else if (e.currentTarget.dataset.fallbackStage !== "2") {
            e.currentTarget.dataset.fallbackStage = "2";
            e.currentTarget.src = getDicebearAvatar(businessName || name);
          }
        }}
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
  } else {
    // No photo, no emoji → illustrated default. onError still wired in case
    // /avatars/* is somehow unreachable.
    inner = (
      <img
        src={defaultAvatar}
        alt={displayName}
        loading="lazy"
        className="w-full h-full object-cover"
        onError={(e) => {
          if (e.currentTarget.dataset.fallbackStage !== "1") {
            e.currentTarget.dataset.fallbackStage = "1";
            e.currentTarget.src = getDicebearAvatar(businessName || name);
          }
        }}
      />
    );
  }

  // Hidden initials fallback rendered below the img — if BOTH the default
  // avatar AND DiceBear fail (extremely rare), CSS shows this through the
  // transparent img. Defensive in depth.
  const initialFallback = !avatarUrl && !avatarEmoji ? (
    <span
      className="absolute inset-0 flex items-center justify-center text-white pointer-events-none"
      style={{ background: INITIAL_BG, zIndex: -1 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  ) : null;

  if (slug) {
    return (
      <Link
        to={`/provider/${slug}`}
        className={`relative ${containerCls}`}
        data-testid={testid}
        aria-label={`Ver eCard de ${displayName}`}
      >
        {initialFallback}
        {inner}
      </Link>
    );
  }
  return (
    <span className={`relative ${containerCls}`} data-testid={testid}>
      {initialFallback}
      {inner}
    </span>
  );
}
