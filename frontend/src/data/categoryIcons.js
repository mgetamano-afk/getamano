/**
 * Section 41 / Correction #4 — Emoji map for category icons.
 *
 * The backend returns Lucide icon NAMES as strings ("Sparkles",
 * "UtensilsCrossed"). Rendering `{c.icon}` directly prints the literal
 * string. We map every Lucide-name back to an emoji so the cards always
 * look right on iOS/Android without dynamic JSX imports.
 *
 * Keys are matched in this order:
 *   1. exact icon name (string from backend)
 *   2. canonical category name (`name_es`)
 *   3. fallback 🛠️
 */

export const ICON_BY_LUCIDE_NAME = {
  Sparkles: "🧹",
  UtensilsCrossed: "🍽️",
  HardHat: "🏗️",
  Wrench: "🔧",
  Car: "🚗",
  Scissors: "✂️",
  Truck: "🚚",
  Scale: "⚖️",
  Calendar: "🎉",
  PartyPopper: "🎉",
  Leaf: "🌿",
  Trees: "🌿",
  BookOpen: "📚",
  GraduationCap: "📚",
  Heart: "💪",
  HeartPulse: "💪",
  PawPrint: "🐾",
  Dog: "🐾",
  Monitor: "💻",
  Laptop: "💻",
  Shirt: "👗",
  Church: "🕊️",
  Dove: "🕊️",
};

export const ICON_BY_CATEGORY_NAME = {
  Limpieza: "🧹",
  "Catering Latino": "🍽️",
  Construcción: "🏗️",
  Mantenimiento: "🔧",
  Automotriz: "🚗",
  "Belleza y Estética": "✂️",
  Mudanzas: "🚚",
  "Servicios Legales": "⚖️",
  "Eventos y Fiestas": "🎉",
  Jardinería: "🌿",
  "Tutoría / Educación": "📚",
  "Salud y Bienestar": "💪",
  Mascotas: "🐾",
  Tecnología: "💻",
  "Textiles y Moda": "👗",
  "Espiritual y Cultural": "🕊️",
};

/** Resolve an emoji for a category, given its `icon` string and `name_es`. */
export function categoryEmoji(iconString, nameEs) {
  if (!iconString && !nameEs) return "🛠️";
  // The backend already stores some entries as actual emoji — pass them through.
  if (iconString && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(iconString)) {
    return iconString;
  }
  if (iconString && ICON_BY_LUCIDE_NAME[iconString]) return ICON_BY_LUCIDE_NAME[iconString];
  if (nameEs && ICON_BY_CATEGORY_NAME[nameEs]) return ICON_BY_CATEGORY_NAME[nameEs];
  return "🛠️";
}
