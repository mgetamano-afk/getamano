import { useEffect, useRef, useState } from "react";
import { Download, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const FORMATS = [
  { id: "post", label: "Post (1080×1080)", w: 1080, h: 1080 },
  { id: "story", label: "Story (1080×1920)", w: 1080, h: 1920 },
];

// Map tier → palette
const TIER_PALETTE = {
  silver:   { from: "#1F2937", to: "#374151", accent: "#94A3B8" },
  gold:     { from: "#7C2D12", to: "#9A3412", accent: "#FBBF24" },
  platinum: { from: "#581C87", to: "#7C2D12", accent: "#F472B6" },
};

/**
 * AchievementImageGenerator — Canvas-based generator that produces a square
 * or vertical sharable image for a milestone. No external services.
 * Drop in by passing `entry` (from journal) and `businessName`/`logoUrl`.
 */
export default function AchievementImageGenerator({ open, entry, businessName, logoUrl, onClose }) {
  const canvasRef = useRef(null);
  const [format, setFormat] = useState("post");
  const [generating, setGenerating] = useState(false);
  const [dataUrl, setDataUrl] = useState("");

  const fmt = FORMATS.find(f => f.id === format) || FORMATS[0];

  useEffect(() => {
    if (!open || !entry) return;
    setDataUrl("");
    setGenerating(true);
    let cancelled = false;
    const render = async () => {
      const cv = canvasRef.current;
      if (!cv) return;
      cv.width = fmt.w; cv.height = fmt.h;
      const ctx = cv.getContext("2d");
      const palette = TIER_PALETTE[entry.tier] || TIER_PALETTE.silver;

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, fmt.w, fmt.h);
      bg.addColorStop(0, "#0B0F2E");
      bg.addColorStop(0.55, palette.from);
      bg.addColorStop(1, palette.to);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, fmt.w, fmt.h);

      // Dot pattern overlay
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let y = 30; y < fmt.h; y += 36) {
        for (let x = 30; x < fmt.w; x += 36) {
          ctx.beginPath();
          ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Decorative glow circle behind emoji
      const cx = fmt.w / 2;
      const cy = fmt.id === "story" ? fmt.h * 0.36 : fmt.h * 0.34;
      const glow = ctx.createRadialGradient(cx, cy, 30, cx, cy, 320);
      glow.addColorStop(0, palette.accent + "AA");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, fmt.w, fmt.h);

      // Top brand
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "700 38px 'Poppins', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("getmano", cx, 90);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 22px 'Poppins', system-ui, sans-serif";
      ctx.fillText("Comunidad latina · USA", cx, 130);

      // Tier ribbon
      const ribbonY = fmt.id === "story" ? 220 : 200;
      const ribbonText = `HITO ${entry.tier?.toUpperCase() || "SILVER"} DESBLOQUEADO`;
      ctx.font = "700 22px 'Poppins', sans-serif";
      const ribbonW = ctx.measureText(ribbonText).width + 56;
      ctx.fillStyle = palette.accent + "33";
      roundRect(ctx, cx - ribbonW / 2, ribbonY, ribbonW, 50, 25);
      ctx.fill();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      ctx.fillText(ribbonText, cx, ribbonY + 33);

      // Big emoji
      const emojiSize = fmt.id === "story" ? 360 : 280;
      ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(entry.emoji || "🏆", cx, cy);
      ctx.textBaseline = "alphabetic";

      // Title (clean of trailing emojis already present at end of titles)
      const titleY = cy + emojiSize / 2 + 80;
      const cleanTitle = (entry.title || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*$/u, "").trim();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 64px 'Poppins', sans-serif";
      wrapText(ctx, cleanTitle, cx, titleY, fmt.w - 120, 72);

      // Message
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "500 36px 'Poppins', sans-serif";
      const msgY = titleY + 130;
      wrapText(ctx, entry.message || "", cx, msgY, fmt.w - 160, 50);

      // Footer: business name (with optional logo)
      const footerY = fmt.h - 160;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, 60, footerY - 30, fmt.w - 120, 130, 30);
      ctx.fill();

      // Try to draw logo if available
      let drawnLogo = false;
      if (logoUrl) {
        try {
          const img = await loadImage(logoUrl);
          ctx.save();
          const logoSize = 90;
          const lx = 100, ly = footerY;
          ctx.beginPath();
          roundRectPath(ctx, lx, ly, logoSize, logoSize, 18);
          ctx.clip();
          ctx.drawImage(img, lx, ly, logoSize, logoSize);
          ctx.restore();
          drawnLogo = true;
        } catch {}
      }
      const textX = drawnLogo ? 220 : 100;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 36px 'Poppins', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(businessName || "Mi negocio", textX, footerY + 40);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "500 24px 'Poppins', sans-serif";
      ctx.fillText("Lo latino, a la mano. · getmano.com", textX, footerY + 78);

      if (cancelled) return;
      const url = cv.toDataURL("image/png");
      setDataUrl(url);
      setGenerating(false);
    };
    // Slight delay so the fonts load
    const t = setTimeout(render, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, entry, format, fmt.w, fmt.h, fmt.id, businessName, logoUrl]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `getmano-${entry?.milestone_id || "logro"}-${format}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    toast.success("¡Imagen descargada! Compártela en tus redes 🧡");
  };

  if (!open || !entry) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose} data-testid="achievement-image-modal">
      <div className="bg-white rounded-3xl max-w-3xl w-full overflow-hidden my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900">Crea una imagen para tus redes</h3>
            <p className="text-xs text-slate-500">Descarga y compártela en Instagram, Facebook, WhatsApp Status...</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center" data-testid="achievement-image-close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 md:p-6 grid md:grid-cols-[1fr_auto] gap-6 items-start">
          {/* Format selector + preview */}
          <div>
            <div className="flex gap-2 mb-4">
              {FORMATS.map(f => (
                <button key={f.id} onClick={() => setFormat(f.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${format === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  data-testid={`achievement-image-fmt-${f.id}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center" style={{ aspectRatio: fmt.id === "story" ? "9 / 16" : "1 / 1", maxHeight: 520 }}>
              {generating && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Generando...
                </div>
              )}
              {dataUrl && (
                <img src={dataUrl} alt="Preview" className="w-full h-full object-contain" data-testid="achievement-image-preview" />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          {/* Actions */}
          <div className="md:w-56 space-y-3">
            <button onClick={download} disabled={!dataUrl} className="w-full py-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50" data-testid="achievement-image-download">
              <Download className="w-4 h-4" /> Descargar PNG
            </button>
            <p className="text-xs text-slate-500 leading-relaxed">
              📸 <strong>Tip:</strong> publícala en Instagram, etiquétanos <strong>@getmano</strong> y duplica tu alcance. Tu historia inspira a más latinos a abrir su eCard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Canvas helpers ---
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || "").split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
