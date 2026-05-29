import { useEffect, useState } from "react";
import { Hash, ShieldCheck, Copy, Check } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

/**
 * GMCodeBadge — Section 88 v3.
 *
 * Reusable card that surfaces the provider's unique `GM-XXXX` code in
 * Ocean Blue gradient with a copy-to-clipboard button.
 *
 * Variants
 * ────────
 *  · "full"     — Used on the Provider Dashboard. Renders a wide
 *                 gradient card with title + big code + helper text +
 *                 copy button. Self-fetches the GM code on mount.
 *  · "inline"   — Tiny pill (used on the public eCard /p/{slug} when
 *                 the provider is verified). Pure presentational —
 *                 receive `code` as a prop, no fetching.
 *
 * The component hides itself when no GM code is available (free-plan
 * providers, or accounts that haven't activated yet).
 */
export default function GMCodeBadge({ variant = "full", code: codeProp = null }) {
  const { lang } = useI18n();
  const [code, setCode] = useState(codeProp);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeProp !== null) { setCode(codeProp); return; }
    let alive = true;
    api.get("/users/me/provider-status")
      .then(r => { if (alive) setCode(r.data?.getamano_code || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [codeProp]);

  if (!code) return null;

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (variant === "inline") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider bg-[#03045E] text-[#90E0EF]"
        data-testid="gm-code-inline"
      >
        <ShieldCheck className="w-3 h-3" />
        {code}
      </span>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 sm:p-6 shadow-lg shadow-[#0077B6]/15"
      style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
      data-testid="gm-code-card"
    >
      <div className="relative flex items-center gap-3 sm:gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#00B4D8] flex items-center justify-center flex-shrink-0 shadow-lg">
          <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#CAF0F8] text-[11px] sm:text-xs uppercase tracking-widest font-bold leading-none mb-1">
            {lang === "en" ? "Your Getamano code" : "Tu código Getamano"}
          </p>
          <p
            className="font-mono font-extrabold text-white text-xl sm:text-2xl tracking-widest select-all leading-tight"
            data-testid="gm-code-value"
          >
            <Hash className="inline w-4 h-4 sm:w-5 sm:h-5 opacity-60 -mt-0.5 mr-0.5" />
            {code}
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 inline-flex items-center gap-1 px-3 h-9 rounded-full bg-white text-[#03045E] text-xs font-bold active:scale-95 transition shadow-md"
          data-testid="gm-code-copy"
        >
          {copied
            ? <><Check className="w-3.5 h-3.5" />{lang === "en" ? "Copied" : "Copiado"}</>
            : <><Copy className="w-3.5 h-3.5" />{lang === "en" ? "Copy" : "Copiar"}</>}
        </button>
      </div>
    </div>
  );
}
