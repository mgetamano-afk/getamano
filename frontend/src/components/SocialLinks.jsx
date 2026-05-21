import { Instagram, Facebook, Youtube, Globe, Music2, Linkedin } from "lucide-react";

/**
 * SocialLinks — Public-facing social icons row for provider eCard.
 * Accepts a `social` object: {instagram, facebook, tiktok, youtube, linkedin}
 */
const NETWORKS = [
  { key: "instagram", Icon: Instagram, label: "Instagram", color: "#E4405F",
    normalize: (v) => v?.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "").trim()}` },
  { key: "facebook", Icon: Facebook, label: "Facebook", color: "#1877F2",
    normalize: (v) => v?.startsWith("http") ? v : `https://facebook.com/${v.replace(/^@/, "").trim()}` },
  { key: "tiktok", Icon: Music2, label: "TikTok", color: "#000000",
    normalize: (v) => v?.startsWith("http") ? v : `https://tiktok.com/@${v.replace(/^@/, "").trim()}` },
  { key: "youtube", Icon: Youtube, label: "YouTube", color: "#FF0000",
    normalize: (v) => v?.startsWith("http") ? v : `https://youtube.com/@${v.replace(/^@/, "").trim()}` },
  { key: "linkedin", Icon: Linkedin, label: "LinkedIn", color: "#0A66C2",
    normalize: (v) => v?.startsWith("http") ? v : `https://linkedin.com/in/${v.replace(/^@/, "").trim()}` },
  { key: "website", Icon: Globe, label: "Sitio web", color: "#0EA5E9",
    normalize: (v) => v?.startsWith("http") ? v : `https://${v.trim()}` },
];

export default function SocialLinks({ social = {}, website, variant = "default", className = "" }) {
  const items = NETWORKS
    .map(n => {
      const raw = (n.key === "website" ? website : social?.[n.key]) || "";
      const val = String(raw).trim();
      if (!val) return null;
      return { ...n, value: val, href: n.normalize(val) };
    })
    .filter(Boolean);

  if (items.length === 0) return null;

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`} data-testid="social-links-compact">
        {items.map(it => (
          <a key={it.key} href={it.href} target="_blank" rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition"
            data-testid={`social-link-${it.key}`} title={it.label}>
            <it.Icon className="w-4 h-4" style={{ color: it.color }} />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} data-testid="social-links">
      {items.map(it => (
        <a key={it.key} href={it.href} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm text-sm text-slate-700 transition"
          data-testid={`social-link-${it.key}`}>
          <it.Icon className="w-4 h-4 flex-shrink-0" style={{ color: it.color }} />
          <span className="font-medium">{it.label}</span>
        </a>
      ))}
    </div>
  );
}
