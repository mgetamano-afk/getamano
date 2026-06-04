import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, Plus, MapPin, DollarSign, Clock, Flame, Loader2, Filter, X, Send, ChevronDown } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { toast } from "sonner";
import { VERTICAL_NAMES } from "../data/categoryGroups";

const CATEGORY_FILTERS = ["Todas", ...VERTICAL_NAMES];

function timeAgo(iso, lang = "es") {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return lang === "en" ? "just now" : "ahora";
  if (mins < 60) return lang === "en" ? `${mins}m ago` : `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "en" ? `${hours}h ago` : `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return lang === "en" ? `${days}d ago` : `hace ${days} d`;
  const weeks = Math.floor(days / 7);
  return lang === "en" ? `${weeks}w ago` : `hace ${weeks} sem`;
}

function GigCard({ gig, lang, onApply, onClose, currentUserId, currentRole }) {
  const T = lang === "en" ? {
    urgent: "Urgent",
    budget: "Budget",
    applicants: (n) => `${n} ${n === 1 ? "applicant" : "applicants"}`,
    apply: "Apply",
    closeMine: "Close gig",
    mine: "Posted by you",
    open: "Open gig",
  } : {
    urgent: "Urgente",
    budget: "Presupuesto",
    applicants: (n) => `${n} ${n === 1 ? "aplicante" : "aplicantes"}`,
    apply: "Aplicar",
    closeMine: "Cerrar chamba",
    mine: "Publicada por ti",
    open: "Ver detalle",
  };

  const budget = (gig.budget_min || gig.budget_max)
    ? `$${gig.budget_min || "?"} – $${gig.budget_max || "?"}`
    : (lang === "en" ? "Open budget" : "Presupuesto abierto");

  const isOwner = currentUserId === gig.created_by;
  const canApply = currentRole === "provider" && !isOwner;

  return (
    <article
      className={`bg-white rounded-2xl border ${gig.is_urgent ? "border-orange-300" : "border-slate-200"} p-5 hover:shadow-md transition`}
      data-testid={`gig-card-${gig.gig_id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: "rgba(2,95,103,0.08)" }}
        >
          <Briefcase className="w-5 h-5" style={{ color: "#03045E" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-500">{gig.category}</span>
            {gig.is_urgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: "#FFEDD5", color: "#C2410C" }}>
                <Flame className="w-3 h-3" /> {T.urgent}
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-slate-900 text-base sm:text-lg mt-1 leading-tight" data-testid={`gig-card-title-${gig.gig_id}`}>
            {gig.title}
          </h3>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed line-clamp-2">{gig.description}</p>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> {budget}
            </span>
            {gig.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {gig.city}{gig.state ? `, ${gig.state}` : ""}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {timeAgo(gig.created_at, lang)}
            </span>
            <span className="text-slate-500">{T.applicants(gig.applicant_count || 0)}</span>
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {isOwner ? (
              <>
                <span className="text-xs font-semibold text-slate-500">{T.mine}</span>
                <button
                  type="button"
                  onClick={() => onClose?.(gig)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  data-testid={`gig-card-close-${gig.gig_id}`}
                >
                  <X className="w-3.5 h-3.5 inline mr-1" /> {T.closeMine}
                </button>
              </>
            ) : canApply ? (
              <button
                type="button"
                onClick={() => onApply?.(gig)}
                className="px-4 py-2 rounded-full text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition inline-flex items-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
                data-testid={`gig-card-apply-${gig.gig_id}`}
              >
                <Send className="w-3.5 h-3.5" /> {T.apply}
              </button>
            ) : (
              <Link
                to={`/empleos/${gig.gig_id}`}
                className="text-xs font-semibold inline-flex items-center gap-1"
                style={{ color: "#03045E" }}
                data-testid={`gig-card-open-${gig.gig_id}`}
              >
                {T.open} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ApplyGigModal({ gig, onClose, onSuccess, lang }) {
  const [message, setMessage] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev || ""; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const submit = async () => {
    if (message.trim().length < 20) {
      toast.error(lang === "en" ? "Message must be at least 20 chars" : "El mensaje debe tener al menos 20 caracteres");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/gigs/${gig.gig_id}/apply`, {
        message: message.trim(),
        proposed_price: price ? Number(price) : undefined,
      });
      toast.success(lang === "en" ? "Application sent" : "Aplicación enviada");
      onSuccess?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-sm animate-in fade-in" onClick={onClose} data-testid="gig-apply-modal">
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-7 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100" aria-label="Close" data-testid="gig-apply-close"><X className="w-5 h-5 text-slate-500" /></button>
        <h2 className="font-display font-bold text-xl text-slate-900 leading-tight">
          {lang === "en" ? "Apply to:" : "Aplicar a:"} <span className="text-teal-700">{gig.title}</span>
        </h2>
        <p className="text-sm text-slate-600 mt-1.5">
          {lang === "en"
            ? "Send a short message to the client. They'll see your business name and rating."
            : "Envía un mensaje breve al cliente. Verá tu nombre de negocio y reseñas."}
        </p>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-1.5">
          {lang === "en" ? "Your message" : "Tu mensaje"}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 500))}
          rows={5}
          maxLength={500}
          placeholder={lang === "en" ? "Hi! I can do this on..." : "¡Hola! Puedo hacer esto el..."}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm"
          data-testid="gig-apply-message"
        />
        <p className="text-[11px] text-slate-400 mt-1 text-right">{message.length}/500</p>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-3 mb-1.5">
          {lang === "en" ? "Your proposed price (USD, optional)" : "Tu precio propuesto (USD, opcional)"}
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="120"
          min={0}
          className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm"
          data-testid="gig-apply-price"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting || message.trim().length < 20}
          className="mt-6 w-full py-3 rounded-2xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition"
          style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
          data-testid="gig-apply-submit"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {lang === "en" ? "Sending…" : "Enviando…"}</> : <><Send className="w-4 h-4" /> {lang === "en" ? "Send application" : "Enviar aplicación"}</>}
        </button>
      </div>
    </div>
  );
}

function PostGigModal({ onClose, onSuccess, lang }) {
  const [form, setForm] = useState({
    title: "", description: "", category: "Limpieza",
    budget_min: "", budget_max: "", city: "", state: "", is_urgent: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev || ""; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.title.trim().length < 6) return toast.error(lang === "en" ? "Title must be at least 6 chars" : "El título debe tener al menos 6 caracteres");
    if (form.description.trim().length < 20) return toast.error(lang === "en" ? "Description must be at least 20 chars" : "Describe la chamba con al menos 20 caracteres");
    setSubmitting(true);
    try {
      const r = await api.post("/gigs", {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        is_urgent: form.is_urgent,
      });
      toast.success(lang === "en" ? "Gig published!" : "¡Chamba publicada!");
      onSuccess?.(r.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-sm animate-in fade-in" onClick={onClose} data-testid="post-gig-modal">
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-7 animate-in slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto scroll-touch" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100" data-testid="post-gig-close" aria-label="Close"><X className="w-5 h-5 text-slate-500" /></button>
        <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">{lang === "en" ? "Post a gig" : "Publicar una chamba"}</h2>
        <p className="text-sm text-slate-600 mt-1.5">{lang === "en" ? "Get bids from verified Latino providers near you." : "Recibe propuestas de proveedores latinos verificados cerca de ti."}</p>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-1.5">{lang === "en" ? "What do you need?" : "¿Qué necesitas?"}</label>
        <input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder={lang === "en" ? "Need someone to clean my house on Saturday" : "Necesito que limpien mi casa el sábado"} className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm" data-testid="post-gig-title" />

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-3 mb-1.5">{lang === "en" ? "Details" : "Detalles"}</label>
        <textarea value={form.description} onChange={(e) => update("description", e.target.value.slice(0, 800))} rows={4} placeholder={lang === "en" ? "3-bedroom house, 2 baths..." : "Casa de 3 recámaras, 2 baños..."} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm" data-testid="post-gig-description" />
        <p className="text-[11px] text-slate-400 mt-1 text-right">{form.description.length}/800</p>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-3 mb-1.5">{lang === "en" ? "Category" : "Categoría"}</label>
        <select value={form.category} onChange={(e) => update("category", e.target.value)} className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm bg-white" data-testid="post-gig-category">
          {VERTICAL_NAMES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">$ {lang === "en" ? "min" : "mín"}</label>
            <input type="number" inputMode="decimal" value={form.budget_min} onChange={(e) => update("budget_min", e.target.value)} placeholder="80" className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm" data-testid="post-gig-min" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">$ max</label>
            <input type="number" inputMode="decimal" value={form.budget_max} onChange={(e) => update("budget_max", e.target.value)} placeholder="150" className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm" data-testid="post-gig-max" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{lang === "en" ? "City" : "Ciudad"}</label>
            <input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Sallisaw" className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm" data-testid="post-gig-city" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{lang === "en" ? "State" : "Estado"}</label>
            <input value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="OK" maxLength={2} className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 outline-none text-sm uppercase" data-testid="post-gig-state" />
          </div>
        </div>

        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={form.is_urgent} onChange={(e) => update("is_urgent", e.target.checked)} className="w-4 h-4 rounded" data-testid="post-gig-urgent" />
          <span className="text-sm text-slate-700"><Flame className="w-3.5 h-3.5 inline text-orange-500" /> {lang === "en" ? "Mark as urgent" : "Marcar como urgente"}</span>
        </label>

        <button type="button" onClick={submit} disabled={submitting} className="mt-6 w-full py-3 rounded-2xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition" style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }} data-testid="post-gig-submit">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {lang === "en" ? "Publishing…" : "Publicando…"}</> : (lang === "en" ? "Publish gig" : "Publicar chamba")}
        </button>
      </div>
    </div>
  );
}

export default function EmpleosPage({ embedded = false }) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("Todas");
  const [showPost, setShowPost] = useState(false);
  const [applyTarget, setApplyTarget] = useState(null);

  // V19.2 — Deep-link support: `/empleos?post=1` opens the compose modal
  // directly. The profile page uses this to point clients straight at
  // the "Publicar chamba" flow without forcing them to discover the
  // floating action button on the listing.
  useEffect(() => {
    if (searchParams.get("post") === "1") {
      setShowPost(true);
      // Clean the query so refreshing doesn't keep re-opening it.
      const next = new URLSearchParams(searchParams);
      next.delete("post");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (category && category !== "Todas") params.category = category;
      const r = await api.get("/gigs", { params });
      setGigs(r.data || []);
    } catch (_e) {
      setGigs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [category]);

  const onApply = (gig) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent("/empleos")}`);
      return;
    }
    if (user.role !== "provider") {
      toast.error(lang === "en" ? "Only providers can apply to gigs" : "Solo proveedores pueden aplicar a chambas");
      return;
    }
    setApplyTarget(gig);
  };

  const onCloseMine = async (gig) => {
    if (!confirm(lang === "en" ? "Close this gig?" : "¿Cerrar esta chamba?")) return;
    try {
      await api.post(`/gigs/${gig.gig_id}/close`);
      toast.success(lang === "en" ? "Gig closed" : "Chamba cerrada");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const T = lang === "en" ? {
    title: "Gigs board",
    subtitle: "Quick one-off jobs from real clients in the US Latino community.",
    postCta: "Post a gig",
    empty: "No gigs in this category yet.",
    emptyCta: "Be the first to post one.",
    loginToPost: "Log in to post a gig",
  } : {
    title: "Chambas",
    subtitle: "Trabajos rápidos publicados por clientes reales de la comunidad latina en USA.",
    postCta: "Publicar una chamba",
    empty: "Aún no hay chambas en esta categoría.",
    emptyCta: "Sé el primero en publicar.",
    loginToPost: "Inicia sesión para publicar",
  };

  return (
    <div className={embedded ? "tab-content-enter" : "min-h-screen bg-neutral-50"} data-testid={embedded ? "empleos-embedded" : undefined}>
      {!embedded && <Header />}
      <main className={`${embedded ? "" : "max-w-5xl mx-auto"} px-4 sm:px-6 lg:px-8 ${embedded ? "py-4" : "py-8 sm:py-12"}`}>
        {/* Header strip */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest" style={{ background: "rgba(255,107,44,0.12)", color: "#C2410C", border: "1px solid rgba(255,107,44,0.28)" }}>
              <Briefcase className="w-3 h-3" /> Beta
            </div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900 mt-3 leading-tight" data-testid="empleos-title">{T.title}</h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-2xl">{T.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => user ? setShowPost(true) : navigate(`/login?next=${encodeURIComponent("/empleos")}`)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-white text-sm font-bold hover:opacity-95 active:scale-[0.98] transition shadow-md"
            style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
            data-testid="empleos-post-cta"
          >
            <Plus className="w-4 h-4" /> {user ? T.postCta : T.loginToPost}
          </button>
        </div>

        {/* Category filter */}
        <div className="mt-6 flex items-center gap-2 overflow-x-auto scrollbar-none pb-1" data-testid="empleos-filter-row">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          {CATEGORY_FILTERS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition border ${category === c ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"}`}
              data-testid={`empleos-filter-${c}`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Gig list */}
        <div className="mt-6 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
            ))
          ) : gigs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="empleos-empty">
              <Briefcase className="w-12 h-12 mx-auto text-slate-300" />
              <p className="font-display font-bold text-slate-800 mt-4 text-base">{T.empty}</p>
              <p className="text-sm text-slate-500 mt-1.5">{T.emptyCta}</p>
              <button
                type="button"
                onClick={() => user ? setShowPost(true) : navigate(`/login?next=${encodeURIComponent("/empleos")}`)}
                className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white text-xs font-semibold"
                style={{ background: "linear-gradient(135deg, #03045E 0%, #0077B6 100%)" }}
                data-testid="empleos-empty-cta"
              >
                <Plus className="w-3.5 h-3.5" /> {T.postCta}
              </button>
            </div>
          ) : (
            gigs.map(g => (
              <GigCard
                key={g.gig_id}
                gig={g}
                lang={lang}
                onApply={onApply}
                onClose={onCloseMine}
                currentUserId={user?.user_id}
                currentRole={user?.role}
              />
            ))
          )}
        </div>
      </main>
      {!embedded && <Footer />}

      {showPost && <PostGigModal onClose={() => setShowPost(false)} onSuccess={() => { setShowPost(false); load(); }} lang={lang} />}
      {applyTarget && <ApplyGigModal gig={applyTarget} onClose={() => setApplyTarget(null)} onSuccess={() => { setApplyTarget(null); load(); }} lang={lang} />}
    </div>
  );
}
