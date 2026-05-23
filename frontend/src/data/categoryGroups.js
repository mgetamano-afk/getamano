/**
 * categoryGroups.js — Section 29 (CAMBIO B) Smart category groups.
 *
 * Each provider's eCard represents one professional identity. When picking
 * "additional services" we only show categories that belong to the same
 * vertical as the primary one — never a cleaning lady's form showing
 * "Música religiosa" or "Catering". If a provider truly does two different
 * verticals, they create a second eCard.
 *
 * Lookup is normalized (lowercase, strip accents) so the same key works
 * for either `Limpieza`/`limpieza`/`LIMPIEZA` or for the EN equivalents.
 */

/** Normalize a category name for matching: lowercase + strip diacritics. */
export function normalizeCategoryKey(s) {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Map from a vertical → list of sub-services that belong to it.
// Keys use ES canonical names; we add EN aliases below.
export const CATEGORY_GROUPS = {
  "Limpieza": [
    "Limpieza del hogar", "Limpieza de alfombras", "Limpieza de ventanas",
    "Limpieza post-construcción", "Limpieza comercial",
    "Organización del hogar", "Lavandería a domicilio",
  ],
  "Construcción": [
    "Construcción y remodelación", "Drywall", "Carpintería", "Pisos",
    "Azulejos y cerámica", "Pintura interior", "Pintura exterior",
    "Instalación de gabinetes", "Ventanas y puertas", "Herrería y metalwork",
    "Cercas / Fencing", "Concreto y pavimento", "Impermeabilización",
    "Techos / Roofing", "Puertas de garage",
  ],
  "Mantenimiento": [
    "Plomería", "Electricidad", "Aire acondicionado y calefacción",
    "Reparación de electrodomésticos", "Instalación de iluminación",
    "Alarmas y cámaras", "Pintura interior", "Pintura exterior",
    "Handyman / Mantenimiento general",
  ],
  "Automotriz": [
    "Mecánica general", "Llantas y rines", "Detailing / Lavado de autos",
    "Pintura automotriz", "Vidrios automotrices", "Instalación de accesorios",
  ],
  "Catering Latino": [
    "Repostería y pasteles", "Comida a domicilio", "Bartending / Bebidas",
    "Chef privado", "Tamales y comida tradicional",
  ],
  "Jardinería": [
    "Poda y mantenimiento de jardín", "Paisajismo", "Instalación de riego",
    "Limpieza de patios", "Remoción de árboles",
  ],
  "Mudanzas": [
    "Mudanzas locales", "Mudanzas de larga distancia",
    "Embalaje y desembalaje", "Almacenamiento temporal",
  ],
  "Belleza y Estética": [
    "Cortes y peinados", "Manicure y pedicure", "Maquillaje",
    "Cejas y pestañas", "Masajes", "Depilación",
  ],
  "Salud y Bienestar": [
    "Entrenamiento personal", "Nutrición y dieta", "Yoga y meditación",
    "Terapia de masajes", "Cuidado de adultos mayores",
    "Cuidado de niños / Babysitting",
  ],
  "Servicios Legales": [
    "Notaría", "Traducciones certificadas", "Taxes / Impuestos",
    "Asesoría migratoria", "Seguros", "Contabilidad",
  ],
  "Eventos y Fiestas": [
    "Fotografía de eventos", "Video de eventos", "DJ", "Decoración",
    "Renta de equipos", "Animación infantil", "Mariachi y música en vivo",
  ],
  "Tutoría / Educación": [
    "Clases de inglés", "Clases de español", "Tutoría académica",
    "Clases de computación", "Preparación para exámenes",
  ],
};

// EN-canonical → ES-canonical so we can support slug "cleaning" matching "Limpieza"
const EN_TO_ES = {
  "cleaning": "Limpieza",
  "construction": "Construcción",
  "handyman": "Mantenimiento",
  "auto": "Automotriz",
  "automotive": "Automotriz",
  "catering": "Catering Latino",
  "landscaping": "Jardinería",
  "moving": "Mudanzas",
  "beauty": "Belleza y Estética",
  "health": "Salud y Bienestar",
  "legal": "Servicios Legales",
  "events": "Eventos y Fiestas",
  "tutoring": "Tutoría / Educación",
  "education": "Tutoría / Educación",
};

// Pre-built normalized lookup tables for O(1) match.
const NORMALIZED_GROUPS = Object.fromEntries(
  Object.entries(CATEGORY_GROUPS).map(([k, v]) => [normalizeCategoryKey(k), v])
);
const NORMALIZED_EN = Object.fromEntries(
  Object.entries(EN_TO_ES).map(([k, v]) => [normalizeCategoryKey(k), v])
);

/**
 * Return the related sub-services for the given main category.
 * Accepts:
 *   • ES canonical ("Limpieza", "Belleza y Estética")
 *   • EN slug ("cleaning", "construction") — mapped to the ES vertical first
 *   • Lowercase / accent-less variants
 * Returns [] if the category is unknown so caller can render a fallback.
 */
export function getRelatedCategories(mainCategory) {
  if (!mainCategory) return [];
  const key = normalizeCategoryKey(mainCategory);
  // Direct match
  if (NORMALIZED_GROUPS[key]) return NORMALIZED_GROUPS[key];
  // EN slug → ES vertical
  const esCanonical = NORMALIZED_EN[key];
  if (esCanonical) return NORMALIZED_GROUPS[normalizeCategoryKey(esCanonical)] || [];
  return [];
}

export const VERTICAL_NAMES = Object.keys(CATEGORY_GROUPS);
