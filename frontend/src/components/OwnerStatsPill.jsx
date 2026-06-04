import { Eye, Play, Heart } from "lucide-react";

/**
 * OwnerStatsPill — V18.2 owner-only metrics overlay for reels + stories.
 *
 * Renders a small pill in the top-LEFT of the reel/story viewport
 * showing views + plays (reels) or views (stories). Visible ONLY when
 * the active user owns the content. Keeps creators in the loop on
 * how their content is performing WITHOUT cluttering the public view
 * for the rest of the community.
 *
 * Why top-left: avoids collision with our right-side action rail
 * (V17.5), the story progress bar (top), and the caption block (bottom).
 *
 * Props:
 *   - kind: "reel" | "story"
 *   - views, plays, likes — numbers (plays optional, only for reels)
 */
export default function OwnerStatsPill({ kind, views = 0, plays, likes }) {
  const fmt = (n) => {
    if (n == null) return "0";
    if (n > 999_999) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n > 999) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <div
      className="absolute top-3 left-3 z-30 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md text-white text-[11px] font-bold tabular-nums shadow-lg"
      data-testid={`owner-stats-pill-${kind}`}
      // The "only-you" label is keyed off the data-attribute so designers
      // can swap the copy without touching React.
      data-owner-only="true"
    >
      <span className="text-[9px] uppercase tracking-widest text-amber-200/90 font-extrabold pr-1 border-r border-white/20 leading-none flex items-center" data-testid="owner-stats-only-you">
        Solo tú
      </span>
      <span className="flex items-center gap-1" data-testid="owner-stats-views" title="Vistas">
        <Eye className="w-3 h-3" /> {fmt(views)}
      </span>
      {plays != null && (
        <span className="flex items-center gap-1" data-testid="owner-stats-plays" title="Reproducciones">
          <Play className="w-3 h-3" /> {fmt(plays)}
        </span>
      )}
      {likes != null && (
        <span className="flex items-center gap-1" data-testid="owner-stats-likes" title="Me gusta">
          <Heart className="w-3 h-3 fill-current text-rose-300" /> {fmt(likes)}
        </span>
      )}
    </div>
  );
}
