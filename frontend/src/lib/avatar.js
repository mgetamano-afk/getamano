/**
 * Default avatars — Section 83.
 *
 * Library of 8 illustrated portraits served from /public/avatars/. Used as
 * fallback when a user has not uploaded a profile picture / logo.
 *
 * Assignment rules:
 *   1. If the user provided a picture/logo URL → use it (caller's job).
 *   2. Else if user has `gender` field set ('male' | 'female') → pick one of
 *      4 perceived-male or perceived-female variants, deterministic by
 *      stable hash of user_id (same user → same avatar every time).
 *   3. Else → hash user_id across all 8 avatars (mixed).
 *
 * Final fallback (if image fails to load in <img>) is the DiceBear avataaars
 * URL (Section 33) which generates an initials-based SVG on the fly.
 *
 * This guarantees every profile shows a friendly portrait — never broken
 * images, never plain initials on raw backgrounds.
 */

const MALE_AVATARS = [
  "/avatars/avatar-m1.png",
  "/avatars/avatar-m2.png",
  "/avatars/avatar-m3.png",
  "/avatars/avatar-m4.png",
];

const FEMALE_AVATARS = [
  "/avatars/avatar-w1.png",
  "/avatars/avatar-w2.png",
  "/avatars/avatar-w3.png",
  "/avatars/avatar-w4.png",
];

const ALL_AVATARS = [...MALE_AVATARS, ...FEMALE_AVATARS];

/**
 * djb2 string hash (fast + good distribution). Used to deterministically
 * map a user_id to an avatar index.
 */
function hashString(s) {
  let h = 5381;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i); // h * 33 + c
    h |= 0;  // force int32
  }
  return Math.abs(h);
}

/**
 * Return a default avatar URL for the given user.
 *
 * @param {object} user — at minimum should have `user_id` (or `provider_id`).
 *   Optional fields used for better matching:
 *     - gender: 'male' | 'female' (case-insensitive)
 *     - name: used as last-resort hash seed when no id
 * @returns {string} relative URL like "/avatars/avatar-m1.png"
 */
export function getDefaultAvatar(user = {}) {
  const seed = user.user_id || user.provider_id || user.id || user.name || "user";
  const gender = String(user.gender || "").toLowerCase();
  const idx = hashString(seed);
  if (gender === "male" || gender === "m" || gender === "hombre" || gender === "masculino") {
    return MALE_AVATARS[idx % MALE_AVATARS.length];
  }
  if (gender === "female" || gender === "f" || gender === "mujer" || gender === "femenino") {
    return FEMALE_AVATARS[idx % FEMALE_AVATARS.length];
  }
  return ALL_AVATARS[idx % ALL_AVATARS.length];
}

/**
 * Smart resolver: returns the BEST avatar URL for a user, with priority:
 *   1. user.picture (OAuth picture from Google etc.)
 *   2. user.logo_url (provider's uploaded logo)
 *   3. user.avatar_url (generic field)
 *   4. getDefaultAvatar(user) — illustrated library
 *
 * Pass this directly to <img src=...>. Combine with onError fallback to
 * DiceBear if even the default image fails to load (rare network case).
 */
export function resolveAvatar(user = {}) {
  if (!user) return getDefaultAvatar({});
  return (
    user.picture ||
    user.logo_url ||
    user.avatar_url ||
    getDefaultAvatar(user)
  );
}

/**
 * DiceBear final-fallback (Section 33). Kept for backward compatibility with
 * call sites that still import this. Used as the <img onError> handler so
 * even if /avatars/* somehow fails, we still show SOMETHING readable.
 */
export function getDicebearAvatar(name = "Provider") {
  const seed = encodeURIComponent(String(name).trim() || "Provider");
  const params = new URLSearchParams({
    seed,
    backgroundColor: "b6e3f4,c0aede,ffd5dc,d1f4e0,fde68a",
    backgroundType: "solid",
    mouth: "smile,default",
    eyes: "happy,default,wink",
    eyebrows: "defaultNatural,default",
    top: "longHairStraight,longHairCurly,shortHairShortFlat,shortHairDreads01,shortHairTheCaesar",
    skinColor: "f8d25c,edb98a,ae5d29,614335,d08b5b",
  });
  return `https://api.dicebear.com/7.x/avataaars/svg?${params.toString()}`;
}
