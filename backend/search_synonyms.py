"""Search synonyms + fuzzy matching — Section 27.

Single source of truth for service synonyms. Used by both:
  • Backend  /api/providers smart search (term expansion + fuzzy fallback)
  • Frontend /api/search/synonyms endpoint feeds the SmartServiceSearch dropdown

Designed for the Latino-in-US bilingual reality:
  • Spanish (correct + common misspellings: limpieza/limpesa/limpeza)
  • English (so "fix pipes" finds Plomería)
  • Spanglish (so "clean my casa" still works)
"""
from __future__ import annotations
import re
import unicodedata
from typing import Iterable

# canonical service name → list of every term that should match it
SEARCH_SYNONYMS: dict[str, list[str]] = {
    # ─── Limpieza ───
    "Limpieza": ["limpesa", "limpeza", "cleaning", "clean", "limpiar", "limpio",
                 "aseo", "cleaner", "house cleaning", "maid"],
    "Limpieza profunda": ["deep clean", "deep cleaning", "limpiesa profunda"],
    "Limpieza de alfombras": ["carpet cleaning", "carpet", "alfombra"],

    # ─── Plomería ───
    "Plomería": ["plomeria", "plumer", "plumber", "plumbing", "tubería", "pipe",
                 "fuga", "leak", "water leak", "fugas de agua"],
    "Reparación de tuberías": ["fix pipe", "fix pipes", "broken pipe", "pipe repair"],

    # ─── Electricidad ───
    "Electricidad": ["electricista", "electrician", "electric", "luz", "corriente",
                     "apagón", "apagon", "electrico", "wiring"],
    "Iluminación": ["lights", "lighting", "luces", "focos", "lamparas", "lámparas"],

    # ─── Jardinería ───
    "Jardinería": ["jardineria", "yardwork", "yard work", "yard", "jardín",
                   "jardin", "garden", "pasto", "grass", "lawn", "cesped",
                   "césped", "landscaping", "podar"],
    "Poda de árboles": ["tree trimming", "tree cutting", "árbol", "podar",
                        "arboles", "tree service"],

    # ─── Construcción ───
    "Construcción": ["construccion", "construction", "remodelación", "remodelacion",
                     "remodel", "remodelar", "renovation", "obra"],
    "Pintura": ["painting", "paint", "pintor", "painter", "pintar"],
    "Pisos": ["flooring", "floor", "suelo", "piso", "laminado", "vinyl"],
    "Drywall": ["drywall", "tablaroca", "yeso"],

    # ─── Eventos ───
    "Quinceañeras": ["quinceanera", "quinceañera", "quince años",
                     "quince anos", "fiesta quince", "xv años"],
    "Fotografía de eventos": ["photographer", "fotógrafo", "fotografo",
                              "fotos", "photo", "photography"],
    "DJ": ["dj", "musica", "música", "music", "disc jockey", "dee jay"],
    "Catering latino": ["catering", "comida", "food", "banquete", "banquet",
                        "tacos", "pupusas", "barbacoa", "comida latina"],
    "Mariachi": ["mariachi", "mariachis", "música en vivo", "live music"],
    "Brincolines": ["bouncy house", "bounce house", "brincolin",
                    "inflable", "moonbounce"],

    # ─── Legal / Finanzas ───
    "Preparación de impuestos": ["taxes", "tax", "impuestos", "income tax",
                                 "tax return", "irs", "w2", "ssa", "itin"],
    "Notario": ["notary", "notario público", "notario publico", "notary public"],
    "Servicios legales": ["abogado", "lawyer", "attorney", "legal", "immigration",
                          "inmigracion", "visa", "asilo"],
    "Registro de LLC": ["llc", "business registration", "incorporar negocio",
                        "registrar empresa", "ein"],

    # ─── Belleza ───
    "Peluquería": ["haircut", "pelo", "hair", "corte de pelo", "barbería",
                   "barberia", "salon", "barber"],
    "Uñas": ["nails", "manicure", "manicura", "pedicure", "pedicura", "uñas"],
    "Maquillaje": ["makeup", "make up", "maquillaje", "maquilladora"],

    # ─── Automotriz ───
    "Mecánica": ["mechanic", "car repair", "auto repair", "carro", "car",
                 "vehicle", "frenos", "brakes", "transmision", "transmisión"],
    "Detailing": ["car wash", "lavar carro", "auto detail", "detailing"],
    "Llantas": ["tires", "tire shop", "llantera", "ruedas"],

    # ─── Salud ───
    "Cuidado de personas mayores": ["elderly care", "senior care", "anciano",
                                    "abuela", "abuelo", "homecare",
                                    "in-home care", "ancianos"],
    "Psicología": ["therapist", "therapy", "terapeuta", "mental health",
                   "psicólogo", "psicologo", "consejería"],
    "Masajes": ["massage", "masaje", "masajista", "deep tissue"],

    # ─── Tecnología ───
    "Reparación de computadoras": ["computer repair", "laptop", "pc repair",
                                   "computadora", "fix computer"],
    "Reparación de celulares": ["phone repair", "cell phone", "celular",
                                "iphone repair", "android repair", "screen repair"],

    # ─── Mascotas ───
    "Paseo de perros": ["dog walking", "dog walker", "perro", "dog"],
    "Cuidado de mascotas": ["pet sitting", "pet care", "mascota", "pet sitter"],

    # ─── Mudanzas ───
    "Mudanzas": ["moving", "mover", "movers", "mudanza", "house moving",
                 "interstate move"],

    # ─── Educación ───
    "Clases de inglés": ["english class", "english lessons", "learn english",
                         "ingles", "ESL"],
    "Tutoría escolar": ["tutor", "tutoring", "ayuda con tareas",
                        "homework help", "tareas"],

    # ─── Hogar - reparaciones generales ───
    "Handyman / Mantenimiento": ["handyman", "fix it", "reparaciones",
                                  "mantenimiento", "repairs", "general repair"],

    # ─── Limpieza de aires ───
    "HVAC / Aire acondicionado": ["hvac", "ac repair", "aire acondicionado",
                                  "calefaccion", "calefacción", "heating",
                                  "air conditioning", "ac"],
}


# ───────────────────────── helpers ─────────────────────────
def normalize(text: str) -> str:
    """Lowercase, strip diacritics, keep only alphanumerics + spaces."""
    if not text:
        return ""
    nfd = unicodedata.normalize("NFD", text.lower())
    no_accents = "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9\s]", " ", no_accents).strip()


def _levenshtein(a: str, b: str) -> int:
    """Compact iterative Levenshtein. Bails out early when length-gap > 3."""
    la, lb = len(a), len(b)
    if abs(la - lb) > 3:
        return 99
    if la == 0:
        return lb
    if lb == 0:
        return la
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        curr = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[lb]


def expand_query(term: str, *, max_results: int = 6) -> list[str]:
    """Given a user-typed term, return the canonical service names that match.

    Strategy (in order of precedence):
      1. Direct substring match against the canonical name
      2. Direct substring match against any synonym
      3. Levenshtein ≤ 2 against the canonical name or any synonym
    """
    needle = normalize(term)
    if not needle or len(needle) < 2:
        return []
    matches: list[tuple[str, int]] = []  # (canonical, priority — lower = better)

    for canonical, synonyms in SEARCH_SYNONYMS.items():
        nc = normalize(canonical)
        # tier 1 — substring of canonical
        if needle in nc or nc in needle:
            matches.append((canonical, 0))
            continue
        norm_syns = [normalize(s) for s in synonyms]
        # tier 2 — substring of any synonym
        if any(needle in s or s in needle for s in norm_syns):
            matches.append((canonical, 1))
            continue
        # tier 3 — fuzzy on canonical
        if _levenshtein(needle, nc) <= 2:
            matches.append((canonical, 2))
            continue
        # tier 4 — fuzzy on any synonym
        if any(_levenshtein(needle, s) <= 2 for s in norm_syns):
            matches.append((canonical, 3))

    matches.sort(key=lambda x: x[1])
    seen: set[str] = set()
    out: list[str] = []
    for canonical, _prio in matches:
        if canonical in seen:
            continue
        seen.add(canonical)
        out.append(canonical)
        if len(out) >= max_results:
            break
    return out


def suggest_alternatives(term: str, *, max_results: int = 3) -> list[str]:
    """When 0 results: nearest canonical names within Levenshtein ≤ 4."""
    needle = normalize(term)
    if not needle:
        return []
    scored = []
    for canonical in SEARCH_SYNONYMS:
        dist = _levenshtein(needle, normalize(canonical))
        if dist <= 4:
            scored.append((dist, canonical))
    scored.sort(key=lambda x: x[0])
    return [c for _d, c in scored[:max_results]]


def all_canonicals() -> Iterable[str]:
    return SEARCH_SYNONYMS.keys()
