import { Link } from "react-router-dom";
import {
  Sparkles, Hammer, ChefHat, Wrench, Car, Droplet, Zap, Trees,
  PaintBucket, GraduationCap, Package, Heart, Scale, PartyPopper, Stethoscope, Briefcase,
} from "lucide-react";

/**
 * Per-slug visual config for category cards. The cards rely entirely on
 * gradient + SVG icon — no external images needed (which were 404'ing
 * from source.unsplash.com and rendering as alt text on grey blocks).
 *
 * Keys MUST match category.slug returned from /api/categories. We map
 * legacy English slugs (cleaning, construction…) AND Spanish slugs
 * (limpieza, construccion…) so we don't break either route.
 */
export const CATEGORY_VISUALS = {
  // Cleaning — deep blue
  cleaning: { icon: Sparkles, gradient: "linear-gradient(145deg, #1E40AF 0%, #1D4ED8 50%, #2563EB 100%)", accent: "#60A5FA" },
  limpieza: { icon: Sparkles, gradient: "linear-gradient(145deg, #1E40AF 0%, #1D4ED8 50%, #2563EB 100%)", accent: "#60A5FA" },

  // Catering — warm orange/red
  catering: { icon: ChefHat, gradient: "linear-gradient(145deg, #C2410C 0%, #EA580C 50%, #F97316 100%)", accent: "#FB923C" },
  food: { icon: ChefHat, gradient: "linear-gradient(145deg, #C2410C 0%, #EA580C 50%, #F97316 100%)", accent: "#FB923C" },

  // Construction — amber/brown
  construction: { icon: Hammer, gradient: "linear-gradient(145deg, #92400E 0%, #B45309 50%, #D97706 100%)", accent: "#F59E0B" },
  construccion: { icon: Hammer, gradient: "linear-gradient(145deg, #92400E 0%, #B45309 50%, #D97706 100%)", accent: "#F59E0B" },

  // Handyman / Maintenance — emerald
  handyman: { icon: Wrench, gradient: "linear-gradient(145deg, #065F46 0%, #047857 50%, #10B981 100%)", accent: "#34D399" },
  mantenimiento: { icon: Wrench, gradient: "linear-gradient(145deg, #065F46 0%, #047857 50%, #10B981 100%)", accent: "#34D399" },

  // Auto — getamano teal
  auto: { icon: Car, gradient: "linear-gradient(145deg, #03045E 0%, #0E7B7F 50%, #14B8A6 100%)", accent: "#2DD4BF" },
  automotive: { icon: Car, gradient: "linear-gradient(145deg, #03045E 0%, #0E7B7F 50%, #14B8A6 100%)", accent: "#2DD4BF" },
  automotriz: { icon: Car, gradient: "linear-gradient(145deg, #03045E 0%, #0E7B7F 50%, #14B8A6 100%)", accent: "#2DD4BF" },

  // Plumbing — navy → blue
  plumbing: { icon: Droplet, gradient: "linear-gradient(145deg, #1E3A5F 0%, #1E40AF 50%, #3B82F6 100%)", accent: "#93C5FD" },
  plomeria: { icon: Droplet, gradient: "linear-gradient(145deg, #1E3A5F 0%, #1E40AF 50%, #3B82F6 100%)", accent: "#93C5FD" },
  "plomería": { icon: Droplet, gradient: "linear-gradient(145deg, #1E3A5F 0%, #1E40AF 50%, #3B82F6 100%)", accent: "#93C5FD" },

  // Electrical — gold
  electrical: { icon: Zap, gradient: "linear-gradient(145deg, #713F12 0%, #A16207 50%, #CA8A04 100%)", accent: "#FDE047" },
  electricidad: { icon: Zap, gradient: "linear-gradient(145deg, #713F12 0%, #A16207 50%, #CA8A04 100%)", accent: "#FDE047" },

  // Landscaping / Gardening — fresh green
  landscaping: { icon: Trees, gradient: "linear-gradient(145deg, #14532D 0%, #166534 50%, #16A34A 100%)", accent: "#86EFAC" },
  jardineria: { icon: Trees, gradient: "linear-gradient(145deg, #14532D 0%, #166534 50%, #16A34A 100%)", accent: "#86EFAC" },
  "jardinería": { icon: Trees, gradient: "linear-gradient(145deg, #14532D 0%, #166534 50%, #16A34A 100%)", accent: "#86EFAC" },

  // Painting — purple
  painting: { icon: PaintBucket, gradient: "linear-gradient(145deg, #581C87 0%, #7E22CE 50%, #A855F7 100%)", accent: "#D8B4FE" },
  pintura: { icon: PaintBucket, gradient: "linear-gradient(145deg, #581C87 0%, #7E22CE 50%, #A855F7 100%)", accent: "#D8B4FE" },

  // Tutoring / Education — indigo
  tutoring: { icon: GraduationCap, gradient: "linear-gradient(145deg, #312E81 0%, #4338CA 50%, #6366F1 100%)", accent: "#A5B4FC" },
  tutoria: { icon: GraduationCap, gradient: "linear-gradient(145deg, #312E81 0%, #4338CA 50%, #6366F1 100%)", accent: "#A5B4FC" },
  "tutoría": { icon: GraduationCap, gradient: "linear-gradient(145deg, #312E81 0%, #4338CA 50%, #6366F1 100%)", accent: "#A5B4FC" },
  education: { icon: GraduationCap, gradient: "linear-gradient(145deg, #312E81 0%, #4338CA 50%, #6366F1 100%)", accent: "#A5B4FC" },

  // Moving — burnt orange
  moving: { icon: Package, gradient: "linear-gradient(145deg, #7C2D12 0%, #9A3412 50%, #EA580C 100%)", accent: "#FDBA74" },
  mudanzas: { icon: Package, gradient: "linear-gradient(145deg, #7C2D12 0%, #9A3412 50%, #EA580C 100%)", accent: "#FDBA74" },

  // Beauty — pink
  beauty: { icon: Heart, gradient: "linear-gradient(145deg, #831843 0%, #BE185D 50%, #EC4899 100%)", accent: "#F9A8D4" },
  belleza: { icon: Heart, gradient: "linear-gradient(145deg, #831843 0%, #BE185D 50%, #EC4899 100%)", accent: "#F9A8D4" },

  // Legal — slate
  legal: { icon: Scale, gradient: "linear-gradient(145deg, #1E293B 0%, #334155 50%, #475569 100%)", accent: "#CBD5E1" },

  // Events — magenta/rose
  events: { icon: PartyPopper, gradient: "linear-gradient(145deg, #831843 0%, #A21CAF 50%, #D946EF 100%)", accent: "#F0ABFC" },
  eventos: { icon: PartyPopper, gradient: "linear-gradient(145deg, #831843 0%, #A21CAF 50%, #D946EF 100%)", accent: "#F0ABFC" },

  // Health — emerald-teal
  health: { icon: Stethoscope, gradient: "linear-gradient(145deg, #064E3B 0%, #047857 50%, #14B8A6 100%)", accent: "#5EEAD4" },
  salud: { icon: Stethoscope, gradient: "linear-gradient(145deg, #064E3B 0%, #047857 50%, #14B8A6 100%)", accent: "#5EEAD4" },
};

const FALLBACK = { icon: Briefcase, gradient: "linear-gradient(145deg, #03045E 0%, #0077B6 50%, #0ABAB5 100%)", accent: "#5EEAD4" };

/**
 * CategoryCard — gradient + icon design, no external images.
 *
 *   • Desktop: 280×340, hovers up 6px
 *   • Mobile : 200×260, taps scale to 0.97
 *   • Accent border at the bottom matches each category's accent color
 *   • Decorative dot pattern + soft top-left highlight for depth
 *   • SVG icon at 64% opacity so the gradient remains the protagonist
 */
export default function CategoryCard({ category, name, providerCount, lang = "es" }) {
  const v = CATEGORY_VISUALS[category.slug] || FALLBACK;
  const Icon = v.icon;
  const subtitle = lang === "en"
    ? (providerCount ? `${providerCount} providers` : "View providers")
    : (providerCount ? `${providerCount} proveedores` : "Ver proveedores");

  return (
    <Link
      to={`/categoria/${category.slug}`}
      className="relative flex-shrink-0 w-[200px] h-[260px] sm:w-[260px] sm:h-[320px] md:w-[280px] md:h-[340px] rounded-[20px] overflow-hidden snap-start group transition-transform duration-300 active:scale-[0.97] md:hover:-translate-y-1.5"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      data-testid={`category-card-${category.slug}`}
      aria-label={`${name} — ${subtitle}`}
    >
      {/* The gradient background */}
      <div className="absolute inset-0" style={{ background: v.gradient }} />

      {/* Subtle dot pattern overlay for texture (Airbnb-style) */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle at 1.5px 1.5px, white 1.2px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Soft top-left highlight = depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 50% at 25% 0%, rgba(255,255,255,0.18), transparent 70%)" }}
      />

      {/* Centered SVG icon (semi-transparent so the gradient leads) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon
          className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-white transition-transform duration-300 md:group-hover:scale-110"
          strokeWidth={1.5}
          style={{ opacity: 0.92, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))" }}
          aria-hidden="true"
        />
      </div>

      {/* Bottom darken gradient for text readability */}
      <div className="absolute bottom-0 left-0 right-0 h-2/5 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)" }} />

      {/* Title + subtitle */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
        <h3 className="font-display font-bold text-white text-lg sm:text-xl md:text-2xl leading-tight tracking-tight" data-testid={`category-name-${category.slug}`}>
          {name}
        </h3>
        <p className="text-xs sm:text-sm text-white/80 mt-1 inline-flex items-center gap-1">
          {subtitle}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </p>
      </div>

      {/* Accent border at the bottom — distinctive per category */}
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: v.accent, boxShadow: `0 0 16px ${v.accent}` }} />
    </Link>
  );
}
