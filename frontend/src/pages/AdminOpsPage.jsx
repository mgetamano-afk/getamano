import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users, Plus, Trash2, Copy, Check, AlertTriangle, ChevronLeft,
  Clock, Zap, TrendingDown, Activity, UserCheck, Mail, RefreshCw,
  Cloud, CloudOff, CheckCircle2, XCircle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { US_STATES } from "../data/usLocations";
import Header from "../components/Header";

const EMPTY_ROW = {
  email: "", name: "", business_name: "",
  phone: "", category_id: "", city: "", state: "", description: "", website: "",
};

/**
 * AdminBulkOnboarding — Section 44.
 *
 * CEO tool: register up to 15 providers in one shot from business-card data.
 * Each created row exposes the temp_password + activation_url so the founder
 * can hand them off manually if the email didn't arrive (dev-fallback mode).
 *
 * Plus a "Latency Dashboard" tab so the CEO has operational visibility on
 * how fast the marketplace is replying.
 */
function BulkOnboarding() {
  const [rows, setRows] = useState(() => Array.from({ length: 3 }, () => ({ ...EMPTY_ROW })));
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [cats, setCats] = useState([]);

  useEffect(() => {
    api.get("/categories").then((r) => setCats(r.data || [])).catch(() => {});
  }, []);

  const addRow = () => setRows((r) => [...r, { ...EMPTY_ROW }]);
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i, field, value) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const valid = rows.filter((r) => r.email && r.name && r.business_name);
  const canSubmit = valid.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/admin/providers/bulk-create", {
        providers: valid,
        send_activation_email: sendEmail,
      });
      setResults(data);
      toast.success(`${data.created} creados · ${data.skipped} omitidos · ${data.errors} errores`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error en el bulk create.");
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
  };

  if (results) {
    return (
      <div className="space-y-4" data-testid="bulk-results">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
          <Check className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-slate-900">Lote procesado</h3>
            <p className="text-sm text-slate-600">
              <strong>{results.created}</strong> creados · {results.skipped} omitidos · {results.errors} errores
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {results.results.map((r, i) => {
            const ok = r.status === "created";
            const skip = r.status === "skipped";
            return (
              <div
                key={i}
                className={`rounded-xl border p-4 ${ok ? "bg-white border-emerald-200" : skip ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}
                data-testid={`bulk-result-${i}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {ok ? <Check className="w-4 h-4 text-emerald-600" /> : skip ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                  <span className="text-sm font-semibold text-slate-900">{r.email}</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold ml-auto px-2 py-0.5 rounded-full" style={{
                    background: ok ? "#D1FAE5" : skip ? "#FEF3C7" : "#FEE2E2",
                    color: ok ? "#065F46" : skip ? "#92400E" : "#991B1B",
                  }}>{r.status}</span>
                </div>
                {ok && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-slate-500">Contraseña temporal:</span>
                      <code className="font-mono font-bold text-slate-900">{r.temp_password}</code>
                      <button onClick={() => copy(r.temp_password)} className="text-teal-600 hover:text-teal-800" data-testid={`bulk-copy-pwd-${i}`}>
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {r.activation_url && (
                      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 gap-2">
                        <span className="text-slate-500 flex-shrink-0">Activación:</span>
                        <code className="font-mono text-[10px] text-slate-700 truncate flex-1 text-right">{r.activation_url}</code>
                        <button onClick={() => copy(r.activation_url)} className="text-teal-600 hover:text-teal-800 flex-shrink-0" data-testid={`bulk-copy-url-${i}`}>
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-500">
                      <Link to={`/p/${r.slug}`} className="text-teal-700 hover:underline">Ver eCard pública →</Link>
                    </p>
                  </div>
                )}
                {!ok && <p className="text-xs text-slate-600">{r.reason || ""}</p>}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => { setResults(null); setRows(Array.from({ length: 3 }, () => ({ ...EMPTY_ROW }))); }}
          className="w-full py-3 rounded-full border-2 border-slate-200 hover:border-teal-500 font-semibold text-slate-700 transition"
          data-testid="bulk-reset"
        >
          Crear otro lote
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="bulk-form">
      <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-sm text-slate-700">
        <p className="font-semibold mb-1 text-teal-900">📇 Carga rápida desde tarjetas de presentación</p>
        <p className="text-xs leading-relaxed">
          Llena cada fila con los datos del negocio. Si activas el envío de correo, cada proveedor recibirá un link para
          crear su contraseña y tomar control de su cuenta. <strong>Si no se envía el correo</strong>, podrás copiar el link
          y la contraseña temporal manualmente.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          className="w-4 h-4 accent-teal-600"
          data-testid="bulk-send-email-toggle"
        />
        <span>Enviar correo de activación automáticamente</span>
      </label>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5" data-testid={`bulk-row-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Proveedor #{i + 1}</span>
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} className="text-red-500 hover:text-red-700" data-testid={`bulk-remove-${i}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="email" placeholder="correo@ejemplo.com *" value={row.email}
                     onChange={(e) => updateRow(i, "email", e.target.value)}
                     className="border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid={`bulk-email-${i}`} />
              <input placeholder="Nombre del dueño *" value={row.name}
                     onChange={(e) => updateRow(i, "name", e.target.value)}
                     className="border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid={`bulk-name-${i}`} />
              <input placeholder="Nombre del negocio *" value={row.business_name}
                     onChange={(e) => updateRow(i, "business_name", e.target.value)}
                     className="border border-slate-200 rounded-lg px-3 py-2 text-sm sm:col-span-2" data-testid={`bulk-business-${i}`} />
              <input placeholder="Teléfono" value={row.phone}
                     onChange={(e) => updateRow(i, "phone", e.target.value)}
                     className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <select value={row.category_id} onChange={(e) => updateRow(i, "category_id", e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Categoría</option>
                {cats.filter(c => c.is_main).map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name_es}</option>
                ))}
              </select>
              <input placeholder="Ciudad" value={row.city}
                     onChange={(e) => updateRow(i, "city", e.target.value)}
                     className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <select value={row.state} onChange={(e) => updateRow(i, "state", e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Estado</option>
                {US_STATES.map((s) => (
                  <option key={s.abbreviation} value={s.abbreviation}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRow} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-teal-500 text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-2" data-testid="bulk-add-row">
        <Plus className="w-4 h-4" /> Agregar otro proveedor
      </button>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full py-3 rounded-full text-white font-bold disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
        data-testid="bulk-submit"
      >
        {submitting ? "Creando..." : `Crear ${valid.length} proveedor${valid.length === 1 ? "" : "es"}`}
      </button>
    </div>
  );
}

function LatencyDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/admin/latency-dashboard")
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Calculando latencias…</div>;
  if (!data) return <div className="text-center py-12 text-slate-400">No se pudo cargar.</div>;

  const buckets = [
    { key: "fast_under_2h", label: "< 2 horas", color: "#1D9E75", Icon: Zap },
    { key: "mid_under_24h", label: "2h–24h", color: "#F59E0B", Icon: Clock },
    { key: "slow_over_24h", label: "> 24 horas", color: "#DC2626", Icon: AlertTriangle },
    { key: "no_reply_yet", label: "Sin respuesta", color: "#64748B", Icon: Activity },
  ];

  return (
    <div className="space-y-5" data-testid="latency-dashboard">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Últimos 30 días</p>
        <h3 className="font-display text-2xl font-bold text-slate-900">{data.total_conversations} conversaciones</h3>
        {data.overall_median_minutes && (
          <p className="text-sm text-slate-600 mt-1">
            Mediana de respuesta: <strong>{Math.round(data.overall_median_minutes)} min</strong>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {buckets.map((b) => {
          const bucket = data.buckets[b.key];
          return (
            <div key={b.key} className="bg-white border border-slate-200 rounded-2xl p-4" data-testid={`latency-bucket-${b.key}`}>
              <b.Icon className="w-4 h-4 mb-2" style={{ color: b.color }} />
              <div className="text-2xl font-bold text-slate-900">{bucket.count}</div>
              <div className="text-[11px] text-slate-500">{b.label}</div>
              <div className="text-[11px] font-bold mt-1" style={{ color: b.color }}>{bucket.pct}%</div>
            </div>
          );
        })}
      </div>

      {data.worst_providers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <h3 className="font-display font-bold text-slate-900 text-sm">Top 10 con mayor latencia</h3>
            <span className="text-xs text-slate-400 ml-auto">Mínimo 3 conversaciones</span>
          </div>
          <div className="divide-y divide-slate-100">
            {data.worst_providers.map((p) => (
              <div key={p.provider_id} className="px-5 py-3 flex items-center gap-3 text-sm" data-testid={`worst-${p.provider_id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{p.business_name || "Proveedor"}</p>
                  <p className="text-[11px] text-slate-400">{p.total} conversaciones · mediana {p.median_minutes ? Math.round(p.median_minutes) + " min" : "—"}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-red-600">{p.slow_rate}%</div>
                  <div className="text-[10px] text-slate-400">tarde &gt;24h</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleCloudStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/google-cloud-status");
      setData(r.data);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo obtener el estado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4" data-testid="google-cloud-status">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Estado de Google Cloud APIs</h2>
          <p className="text-sm text-slate-500 mt-1">
            Verifica si Translation y Vision están habilitadas en tu proyecto.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-60"
          data-testid="cloud-refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refrescar
        </button>
      </div>

      {!data ? (
        <div className="py-16 text-center text-slate-400 text-sm">Cargando…</div>
      ) : !data.configured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" data-testid="cloud-not-configured">
          <CloudOff className="w-5 h-5 inline mr-2 -mt-0.5" />
          <strong>GOOGLE_API_KEY no configurada</strong> en el backend. {data.hint}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <span className="font-semibold">API key configurada:</span>{" "}
            <code className="bg-slate-100 px-2 py-0.5 rounded">{data.key_prefix}</code>
            <span className="text-slate-400 ml-3 text-xs">
              Última verificación: {data.checked_at?.replace("T", " ").slice(0, 19)}
            </span>
          </div>

          <ApiStatusRow
            name="Cloud Translation API"
            description="Traduce automáticamente descripciones y reseñas ES↔EN"
            console_url="https://console.cloud.google.com/apis/library/translate.googleapis.com"
            status={data.translation}
            testid="cloud-translation-row"
          />
          <ApiStatusRow
            name="Cloud Vision API"
            description="OCR para escanear tarjetas de negocio y autocompletar perfil"
            console_url="https://console.cloud.google.com/apis/library/vision.googleapis.com"
            status={data.vision}
            testid="cloud-vision-row"
          />

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <strong>¿Cómo activar las APIs? (2 min)</strong>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-blue-800">
              <li>Abre <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Cloud Console → APIs Library</a></li>
              <li>Busca <strong>"Cloud Translation API"</strong> → click <strong>Enable</strong></li>
              <li>Busca <strong>"Cloud Vision API"</strong> → click <strong>Enable</strong></li>
              <li>Vuelve aquí y haz click en <strong>Refrescar</strong> — los círculos deben pasar a verde.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

function ApiStatusRow({ name, description, console_url, status, testid }) {
  const ok = status?.enabled;
  return (
    <div
      className={`rounded-2xl border p-4 flex items-start gap-4 ${ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
      data-testid={testid}
    >
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${ok ? "bg-emerald-500" : "bg-red-500"}`}>
        {ok ? <CheckCircle2 className="w-6 h-6 text-white" /> : <XCircle className="w-6 h-6 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-sm font-bold ${ok ? "text-emerald-900" : "text-red-900"}`}>{name}</h3>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${ok ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"}`}>
            {ok ? "ACTIVA" : "INACTIVA"}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-1">{description}</p>
        {!ok && status?.hint && (
          <p className="text-xs text-red-800 mt-2 leading-snug">⚠️ {status.hint}</p>
        )}
        {!ok && (
          <a
            href={console_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-red-700 underline hover:text-red-900"
            data-testid={`${testid}-console-link`}
          >
            Habilitar en Google Cloud Console <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {ok && status?.sample && (
          <p className="text-xs text-emerald-700 mt-2">
            ✓ Prueba: <code className="bg-white/60 px-1 rounded">"ok" → "{status.sample}"</code>
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminOpsPage() {
  const [tab, setTab] = useState("bulk");
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8" data-testid="admin-ops-page">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-4">
          <ChevronLeft className="w-4 h-4" /> Panel admin
        </Link>
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-6 tracking-tight">Operaciones</h1>

        <div className="flex gap-2 mb-6 border-b border-slate-200 flex-wrap">
          <button
            onClick={() => setTab("bulk")}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition ${tab === "bulk" ? "text-teal-700" : "text-slate-400 hover:text-slate-600 border-transparent"}`}
            style={{ borderColor: tab === "bulk" ? "#03045E" : "transparent" }}
            data-testid="admin-ops-tab-bulk"
          >
            <Users className="w-4 h-4 inline mr-1.5" /> Onboarding masivo
          </button>
          <button
            onClick={() => setTab("latency")}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition ${tab === "latency" ? "text-teal-700" : "text-slate-400 hover:text-slate-600 border-transparent"}`}
            style={{ borderColor: tab === "latency" ? "#03045E" : "transparent" }}
            data-testid="admin-ops-tab-latency"
          >
            <Clock className="w-4 h-4 inline mr-1.5" /> Latencia de respuesta
          </button>
          <button
            onClick={() => setTab("cloud")}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition ${tab === "cloud" ? "text-teal-700" : "text-slate-400 hover:text-slate-600 border-transparent"}`}
            style={{ borderColor: tab === "cloud" ? "#03045E" : "transparent" }}
            data-testid="admin-ops-tab-cloud"
          >
            <Cloud className="w-4 h-4 inline mr-1.5" /> Google Cloud
          </button>
        </div>

        {tab === "bulk" && <BulkOnboarding />}
        {tab === "latency" && <LatencyDashboard />}
        {tab === "cloud" && <GoogleCloudStatus />}
      </main>
    </div>
  );
}
