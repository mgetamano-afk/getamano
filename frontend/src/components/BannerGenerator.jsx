import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api";
import { Sparkles, Download, Loader2, X, Palette, RefreshCw, Image as ImageIcon, Check, Share2, Globe, Eye } from "lucide-react";
import { toast } from "sonner";
import { buildFileUrl } from "./ImageUpload";
import { useI18n } from "../contexts/I18nContext";
import { Link } from "react-router-dom";

/**
 * BannerGenerator — Section 49.
 *
 * Pro AI-powered banner / business card generator. Provider picks a brand
 * color and a style; the backend generates an abstract background image via
 * gpt-image-1. We then compose the final banner client-side using Canvas:
 *   - AI background (1024×1024 from gpt-image-1, scaled to 1200×630)
 *   - Dark gradient overlay on the left side for legibility
 *   - Business name (huge), category, city, phone, website
 *   - QR code (api.qrserver.com) pointing to the public eCard
 *   - getamano logo footer + small "Profesional Verificado" badge
 *
 * The provider can change the color/style and regenerate, then download as PNG.
 *
 * Props:
 *   profile  · the provider_profile object
 */
const STYLE_OPTIONS = [
  { id: "modern", label: "Moderno", emoji: "✨", desc: "Limpio, gradientes y formas geométricas" },
  { id: "festive", label: "Festivo", emoji: "🎉", desc: "Colorido, alegre y celebrativo" },
  { id: "professional", label: "Profesional", emoji: "💼", desc: "Elegante y corporativo" },
  { id: "minimal", label: "Minimalista", emoji: "🤍", desc: "Mucho espacio en blanco, sutil" },
  { id: "warm", label: "Cálido", emoji: "🌅", desc: "Atardecer, acogedor, orgullo latino" },
];

const COLOR_PALETTE = [
  { name: "Teal getamano", value: "#2F9D94" },
  { name: "Azul profundo", value: "#063154" },
  { name: "Naranja", value: "#F97316" },
  { name: "Rojo coral", value: "#EF4444" },
  { name: "Verde esmeralda", value: "#10B981" },
  { name: "Morado real", value: "#8B5CF6" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Amarillo dorado", value: "#F59E0B" },
  { name: "Gris pizarra", value: "#475569" },
];

const BANNER_W = 1200;
const BANNER_H = 630;

export default function BannerGenerator({ profile }) {
  const canvasRef = useRef(null);
  const { lang } = useI18n();
  const [color, setColor] = useState(COLOR_PALETTE[0].value);
  const [style, setStyle] = useState("modern");
  const [keywords, setKeywords] = useState("");
  const [generating, setGenerating] = useState(false);
  const [bgImage, setBgImage] = useState(""); // data URL or http URL
  const [composedUrl, setComposedUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedShareId, setPublishedShareId] = useState(""); // tracks current published instance

  const slug = profile?.slug || "";
  const businessName = profile?.business_name || "Tu Negocio";
  const phone = profile?.phone || "";
  const city = profile?.city || "";
  const state = profile?.state || "";
  const website = profile?.website || "";

  // Compute share URL once — uses OG endpoint so QR scans yield rich social
  // previews when shared further. Auto-redirects to /p/{slug} for humans.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const backend = process.env.REACT_APP_BACKEND_URL || origin;
  const publicUrl = slug ? `${backend}/api/og/p/${slug}` : `${origin}`;
  // Cleaner version for the printed text on the banner
  const displayPublicUrl = slug ? `${origin}/p/${slug}` : origin;

  useEffect(() => {
    // QR as URL — server-rendered, doesn't taint canvas if we set crossOrigin
    const q = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(publicUrl)}&color=0F172A&bgcolor=FFFFFF`;
    setQrUrl(q);
  }, [publicUrl]);

  const generate = async () => {
    setGenerating(true);
    setComposedUrl("");
    setPublishedShareId(""); // new generation invalidates prior published instance
    try {
      const { data } = await api.post("/providers/me/generate-banner", {
        color,
        style,
        keywords: keywords.trim() || null,
      }, { timeout: 90000 });
      const dataUrl = `data:${data.mime || "image/png"};base64,${data.image_base64}`;
      setBgImage(dataUrl);
      toast.success(lang === "en" ? "Banner generated" : "Banner generado");
    } catch (e) {
      const msg = e?.response?.data?.detail || (lang === "en" ? "Generation failed. Try again." : "Error al generar. Reintenta.");
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Re-compose canvas any time the background image (or core fields) changes
  useEffect(() => {
    if (!bgImage) return;
    let cancelled = false;

    const compose = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = BANNER_W;
      canvas.height = BANNER_H;
      const ctx = canvas.getContext("2d");

      // 1. Solid backdrop (color) so failed image still produces something
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, BANNER_W, BANNER_H);

      // 2. Load background image
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            // Cover-fit: scale + center the AI square image inside 1200x630
            const srcRatio = img.width / img.height;
            const dstRatio = BANNER_W / BANNER_H;
            let drawW, drawH, dx, dy;
            if (srcRatio > dstRatio) {
              drawH = BANNER_H;
              drawW = drawH * srcRatio;
              dx = (BANNER_W - drawW) / 2;
              dy = 0;
            } else {
              drawW = BANNER_W;
              drawH = drawW / srcRatio;
              dx = 0;
              dy = (BANNER_H - drawH) / 2;
            }
            ctx.drawImage(img, dx, dy, drawW, drawH);
            resolve();
          };
          img.onerror = reject;
          img.src = bgImage;
        });
      } catch { /* keep solid fill */ }

      // 3. Left dark gradient overlay for legibility
      const grad = ctx.createLinearGradient(0, 0, BANNER_W, 0);
      grad.addColorStop(0, "rgba(2, 6, 23, 0.92)");
      grad.addColorStop(0.55, "rgba(2, 6, 23, 0.55)");
      grad.addColorStop(0.8, "rgba(2, 6, 23, 0.12)");
      grad.addColorStop(1, "rgba(2, 6, 23, 0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, BANNER_W, BANNER_H);

      // 4. Brand accent stripe on the far left
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 12, BANNER_H);

      // 5. Text content (left side)
      const textX = 60;
      // Top label
      ctx.fillStyle = color;
      ctx.font = "600 18px 'Poppins', 'Inter', system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("PROFESIONAL VERIFICADO · GETAMANO", textX, 80);

      // Business name (auto-shrink if too long)
      ctx.fillStyle = "#FFFFFF";
      let nameFont = 64;
      ctx.font = `800 ${nameFont}px 'Poppins', 'Inter', system-ui, sans-serif`;
      while (ctx.measureText(businessName).width > BANNER_W * 0.55 && nameFont > 28) {
        nameFont -= 2;
        ctx.font = `800 ${nameFont}px 'Poppins', 'Inter', system-ui, sans-serif`;
      }
      ctx.fillText(businessName, textX, 170);

      // City line
      if (city || state) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "500 26px 'Poppins', 'Inter', system-ui, sans-serif";
        ctx.fillText(`📍 ${[city, state].filter(Boolean).join(", ")}`, textX, 215);
      }

      // Phone
      if (phone) {
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "600 28px 'Poppins', 'Inter', system-ui, sans-serif";
        ctx.fillText(`📞 ${phone}`, textX, 290);
      }

      // Website
      if (website) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "500 22px 'Poppins', 'Inter', system-ui, sans-serif";
        const cleanSite = website.replace(/^https?:\/\//, "");
        ctx.fillText(`🌐 ${cleanSite}`, textX, 330);
      }

      // Tagline
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "italic 500 22px 'Poppins', 'Inter', system-ui, sans-serif";
      ctx.fillText("Escanea el QR para conocernos →", textX, BANNER_H - 110);

      // Public URL
      ctx.fillStyle = color;
      ctx.font = "700 22px 'Poppins', 'Inter', system-ui, sans-serif";
      const cleanUrl = displayPublicUrl.replace(/^https?:\/\//, "");
      ctx.fillText(cleanUrl, textX, BANNER_H - 70);

      // 6. QR code in right area
      if (qrUrl) {
        try {
          await new Promise((resolve, reject) => {
            const qImg = new Image();
            qImg.crossOrigin = "anonymous";
            qImg.onload = () => {
              const qSize = 280;
              const qx = BANNER_W - qSize - 60;
              const qy = (BANNER_H - qSize) / 2;
              // White rounded background
              ctx.fillStyle = "#FFFFFF";
              roundRect(ctx, qx - 20, qy - 20, qSize + 40, qSize + 40, 24);
              ctx.fill();
              ctx.drawImage(qImg, qx, qy, qSize, qSize);
              resolve();
            };
            qImg.onerror = reject;
            qImg.src = qrUrl;
          });
        } catch { /* QR optional */ }
      }

      // 7. getamano footer logo (bottom-right)
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "500 14px 'Poppins', 'Inter', system-ui, sans-serif";
      ctx.fillText("getamano.us", BANNER_W - 130, BANNER_H - 25);

      if (!cancelled) {
        setComposedUrl(canvas.toDataURL("image/png"));
      }
    };

    compose();
    return () => { cancelled = true; };
  }, [bgImage, color, businessName, city, state, phone, website, publicUrl, displayPublicUrl, qrUrl]);

  // Rounded rectangle helper
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const download = () => {
    if (!composedUrl) return;
    const a = document.createElement("a");
    a.href = composedUrl;
    a.download = `${slug || "banner"}-getamano-banner.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(lang === "en" ? "Banner downloaded" : "Banner descargado");
  };

  // Marketplace de Banners — publish the composed PNG to the public gallery
  const publishToGallery = async () => {
    if (!composedUrl || publishing) return;
    setPublishing(true);
    try {
      // 1. Convert dataURL → Blob → File for the existing upload endpoint
      const resp = await fetch(composedUrl);
      const blob = await resp.blob();
      const file = new File([blob], `${slug || "banner"}-${Date.now()}.png`, { type: "image/png" });
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      const imageUrl = up.data?.url;
      if (!imageUrl) throw new Error("upload failed");
      // 2. Publish metadata
      const pub = await api.post("/banners/publish", {
        image_url: imageUrl,
        style,
        color,
        keywords: keywords.trim() || null,
      });
      setPublishedShareId(pub.data?.share_id || "");
      toast.success(lang === "en" ? "Banner published to gallery 🎉" : "¡Banner publicado en la galería! 🎉");
    } catch (e) {
      toast.error(e?.response?.data?.detail || (lang === "en" ? "Couldn't publish. Try again." : "No se pudo publicar. Reintenta."));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div data-testid="banner-generator">
      <div className="flex items-start gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-lg text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" /> Banner Profesional con IA
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Genera un banner único para WhatsApp, Facebook, Instagram, LinkedIn o impreso. Elige tu color y estilo, y nuestra IA crea el fondo perfecto. Listo para descargar.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="grid md:grid-cols-2 gap-4 mb-5">
        {/* Color picker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4" /> Color principal
          </label>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {COLOR_PALETTE.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`relative w-full aspect-square rounded-full transition-all ${color === c.value ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-105"}`}
                style={{ backgroundColor: c.value }}
                title={c.name}
                data-testid={`banner-color-${c.value.replace("#", "")}`}
                aria-label={c.name}
              >
                {color === c.value && (
                  <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border-0"
              data-testid="banner-color-custom"
              aria-label="Color personalizado"
            />
            <span className="text-xs text-slate-500">o elige tu propio color</span>
            <code className="ml-auto text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">{color.toUpperCase()}</code>
          </div>
        </div>

        {/* Style picker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" /> Estilo del banner
          </label>
          <div className="space-y-2">
            {STYLE_OPTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${style === s.id ? "border-teal-500 bg-teal-50 ring-1 ring-teal-200" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                data-testid={`banner-style-${s.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{s.emoji}</span>
                  <span className="font-medium text-sm text-slate-900">{s.label}</span>
                  {style === s.id && <Check className="w-4 h-4 text-teal-600 ml-auto" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 pl-8">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Optional keywords */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Palabras clave (opcional)</label>
        <input
          type="text"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          placeholder="ej. plomería profesional, herramientas, tuberías"
          maxLength={200}
          className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm"
          data-testid="banner-keywords"
        />
        <p className="text-xs text-slate-400 mt-1">Ayuda a la IA a darle sabor temático a tu banner</p>
      </div>

      {/* Generate + Download buttons */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          data-testid="banner-generate-btn"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Generando..." : bgImage ? "Volver a generar" : "Generar banner con IA"}
        </button>
        {bgImage && !generating && (
          <button
            type="button"
            onClick={generate}
            className="btn-outline inline-flex items-center gap-2 text-sm"
            data-testid="banner-regenerate-btn"
            aria-label="Otra variación"
          >
            <RefreshCw className="w-4 h-4" /> Otra variación
          </button>
        )}
        {composedUrl && (
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium"
            data-testid="banner-download-btn"
          >
            <Download className="w-4 h-4" /> {lang === "en" ? "Download PNG" : "Descargar PNG"}
          </button>
        )}
        {composedUrl && !publishedShareId && (
          <button
            type="button"
            onClick={publishToGallery}
            disabled={publishing}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-sm font-medium disabled:opacity-60"
            data-testid="banner-publish-btn"
            title={lang === "en" ? "Show your banner in the public Banner Gallery for inspiration" : "Muestra tu banner en la galería pública para inspirar a otros"}
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            {publishing ? (lang === "en" ? "Publishing..." : "Publicando...") : (lang === "en" ? "Publish to gallery" : "Publicar en galería")}
          </button>
        )}
        {publishedShareId && (
          <div className="inline-flex items-center gap-2 px-4 h-11 rounded-full bg-emerald-50 text-emerald-700 text-sm border border-emerald-200" data-testid="banner-published-badge">
            <Check className="w-4 h-4" />
            {lang === "en" ? "Published" : "Publicado"}
            <Link to={lang === "en" ? "/banner-gallery" : "/galeria-banners"} className="ml-1 underline inline-flex items-center gap-1 hover:text-emerald-800" data-testid="banner-published-view-link">
              <Eye className="w-3 h-3" /> {lang === "en" ? "View" : "Ver"}
            </Link>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-6 overflow-x-auto">
        <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-3 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Vista previa · {BANNER_W}×{BANNER_H} px · listo para redes sociales
        </div>
        {!bgImage && !generating && (
          <div className="aspect-[1200/630] rounded-xl bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 p-8 text-center" data-testid="banner-empty-state">
            <Sparkles className="w-12 h-12 text-slate-300 mb-3" />
            <p className="font-medium text-slate-600 mb-1">Aún no has generado tu banner</p>
            <p className="text-xs text-slate-500 max-w-md">Elige un color y estilo arriba, luego toca <strong>Generar banner con IA</strong> para crear una versión única para tu negocio.</p>
          </div>
        )}
        {generating && (
          <div className="aspect-[1200/630] rounded-xl bg-gradient-to-br from-teal-50 to-slate-100 flex flex-col items-center justify-center text-slate-500" data-testid="banner-loading">
            <Loader2 className="w-12 h-12 animate-spin text-teal-600 mb-3" />
            <p className="font-medium text-slate-700">La IA está creando tu banner...</p>
            <p className="text-xs text-slate-500 mt-1">Esto suele tardar 20–40 segundos</p>
          </div>
        )}
        {composedUrl && !generating && (
          <img
            src={composedUrl}
            alt="Banner profesional generado"
            className="w-full rounded-xl shadow-md"
            data-testid="banner-preview-img"
          />
        )}
        {/* Hidden working canvas */}
        <canvas ref={canvasRef} className="hidden" data-testid="banner-canvas" />
      </div>

      {/* Helper tips */}
      <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">💡 Tips para tu banner</p>
          <ul className="text-xs space-y-0.5">
            <li>• Compártelo en WhatsApp, Facebook, Instagram, LinkedIn o imprime como volante</li>
            <li>• El QR lleva directo a tu eCard de getamano — funciona desde cualquier cámara</li>
            <li>• Genera variaciones gratis hasta 10 veces al día</li>
            <li>• Para mejores resultados, pon palabras clave de tu oficio (ej. "construcción", "limpieza")</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
