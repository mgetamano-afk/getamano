import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Share2, TrendingUp, MessageCircle, Mail, QrCode, Smartphone, Copy } from "lucide-react";

const CHANNEL_META = {
  whatsapp: { icon: MessageCircle, color: "text-green-500" },
  email:    { icon: Mail,           color: "text-blue-500" },
  qr:       { icon: QrCode,         color: "text-orange-500" },
  native:   { icon: Smartphone,     color: "text-purple-500" },
  copy:     { icon: Copy,           color: "text-slate-500" },
};

/**
 * ShareStatsCard — viral KPI strip under ShareLinkCard.
 *
 * Reads denormalised counters from /providers/me/share-stats (single roundtrip,
 * ~5 ms server-side, no joins). Renders zero-state copy that explains the value
 * prop so providers know why to share.
 */
export default function ShareStatsCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get("/providers/me/share-stats")
      .then((r) => { if (!cancelled) setStats(r.data); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !stats) return null;

  const shares = stats.share_count || 0;
  const views = stats.referred_view_count || 0;
  const conversionLabel = shares > 0
    ? `${views > 0 ? `${(views / shares).toFixed(1)}x` : "0.0x"}`
    : "—";
  const channels = stats.share_channels || {};
  const topChannels = Object.entries(channels).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div
      className="rounded-3xl border border-slate-200 bg-white p-5 mb-6"
      data-testid="share-stats-card"
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-bold text-slate-900">Tu impacto al compartir</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Veces que compartiste"
          value={shares}
          icon={<Share2 className="w-4 h-4 text-teal-600" />}
          testid="share-stat-shares"
        />
        <Metric
          label="Visitas vía tus shares"
          value={views}
          icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
          accent="emerald"
          testid="share-stat-views"
        />
        <Metric
          label="Multiplicador viral"
          value={conversionLabel}
          icon={<span className="text-lg leading-none">🚀</span>}
          accent="amber"
          testid="share-stat-multiplier"
        />
      </div>

      {/* Channel breakdown */}
      {topChannels.length > 0 && (
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
            Por canal:
          </span>
          {topChannels.map(([ch, n]) => {
            const meta = CHANNEL_META[ch] || CHANNEL_META.copy;
            const Icon = meta.icon;
            return (
              <span
                key={ch}
                className="inline-flex items-center gap-1 text-xs text-slate-600"
                data-testid={`share-stat-channel-${ch}`}
              >
                <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                <span className="font-medium">{n}</span>
                <span className="capitalize">{ch}</span>
              </span>
            );
          })}
        </div>
      )}

      {shares === 0 && (
        <p className="mt-3 text-xs text-slate-500 italic">
          💡 Comparte tu eCard por WhatsApp — cada cliente que llegue vía tu link cuenta como visita referida y se acumula aquí.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, icon, accent, testid }) {
  return (
    <div
      className={`rounded-2xl p-3 border ${
        accent === "emerald"
          ? "bg-emerald-50 border-emerald-100"
          : accent === "amber"
          ? "bg-amber-50 border-amber-100"
          : "bg-teal-50 border-teal-100"
      }`}
      data-testid={testid}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}
