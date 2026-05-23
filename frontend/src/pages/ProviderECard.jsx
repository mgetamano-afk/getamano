import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import ShareECard from "../components/ShareECard";
import SocialLinks from "../components/SocialLinks";
import { buildFileUrl } from "../components/ImageUpload";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { ShieldCheck, Phone, MessageSquare, FileText, MapPin, Star, Clock, Globe, Heart, Mail, ChevronLeft, Home as HomeIcon, X, Award, CreditCard, Flag, Calendar, Sparkles } from "lucide-react";
import WhatsAppButton from "../components/WhatsAppButton";
import LikeButton from "../components/LikeButton";
import ECardModal from "../components/ECardModal";
import ECardFloatingHeader from "../components/ECardFloatingHeader";
import ShareECardBlock from "../components/ShareECardBlock";
import EngagementBadges from "../components/EngagementBadges";
import QuoteRequestModal from "../components/QuoteRequestModal";
import OwnerIdentityBadge from "../components/OwnerIdentityBadge";
import ReportModal from "../components/ReportModal";
import GalleryGrid from "../components/GalleryGrid";
import CategoryIcon from "../components/CategoryIcon";
import BookingModal from "../components/BookingModal";
import RecommendModal from "../components/RecommendModal";
import RecommendationsSection from "../components/RecommendationsSection";
import { LicenseBadge } from "../components/LicenseSection";
import { formatRate } from "../components/ProviderRates";
import { toast } from "sonner";

export default function ProviderECard() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [mode, setMode] = useState("message"); // "message" | "quote"
  const [msgBody, setMsgBody] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  // (gallery now uses GalleryGrid with its own built-in lightbox + arrow navigation)
  const [showECardModal, setShowECardModal] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const [recommendsRefreshKey, setRecommendsRefreshKey] = useState(0);
  const [refBy, setRefBy] = useState(null);  // resolved from ?via=token
  const [rates, setRates] = useState([]);

  useEffect(() => {
    api.get(`/providers/by-slug/${slug}`).then(r => {
      setP(r.data);
      api.get(`/providers/${r.data.provider_id}/rates`).then(rr => setRates(rr.data?.rates || [])).catch(() => {});
    }).finally(() => setLoading(false));
  }, [slug]);

  // Section 46 — Credit the referrer if visitor arrived via ?ref={slug}.
  // sessionStorage dedup: only one count per (referrer, browser tab) — keeps it
  // honest without blocking page render.
  // Resolve ?via=share_token → "Recommended by [name]" hero banner
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref || !p) return;
    if (ref === p.slug) return; // never self-credit
    try {
      const key = `gm_ref_seen_${ref}_${p.slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch (_e) { /* private mode → still fire once */ }
    api.post("/providers/track-share-view", { ref }).catch(() => {});
  }, [searchParams, p]);

  useEffect(() => {
    const token = searchParams.get("via");
    if (!token) { setRefBy(null); return; }
    api.get(`/recommendations/by-token/${token}`)
      .then(r => setRefBy(r.data.recommendation))
      .catch(() => setRefBy(null));
  }, [searchParams]);

  const trackClick = () => {
    if (p) api.post(`/providers/${p.provider_id}/contact-click`).catch(() => {});
  };

  const addFavorite = async () => {
    if (!user) { toast.error("Inicia sesión para guardar favoritos"); return; }
    try {
      await api.post("/favorites", { provider_id: p.provider_id });
      toast.success("Agregado a favoritos");
    } catch (e) { toast.error("Error"); }
  };

  const sendQuoteRequest = async () => {
    if (!user) { toast.error("Inicia sesión para pedir cotización"); return; }
    try {
      await api.post("/service-requests", { provider_id: p.provider_id, message: msgBody, service_type: msgSubject || "" });
      toast.success("¡Solicitud enviada! El proveedor recibirá una notificación.");
      setShowMessage(false); setMsgBody(""); setMsgSubject("");
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Inicia sesión para enviar mensajes"); return; }
    try {
      await api.post("/messages", { provider_id: p.provider_id, body: msgBody, subject: msgSubject || "Solicitud" });
      toast.success("Mensaje enviado");
      setShowMessage(false); setMsgBody(""); setMsgSubject("");
      trackClick();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    }
  };

  const share = null;

  const [paidRange, setPaidRange] = useState("");
  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Inicia sesión para reseñar"); return; }
    setSubmitting(true);
    try {
      await api.post("/reviews", { provider_id: p.provider_id, rating, comment, paid_amount_range: paidRange || null });
      toast.success("Gracias por tu reseña");
      const r = await api.get(`/providers/by-slug/${slug}`);
      setP(r.data);
      setComment(""); setPaidRange("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("common.loading")}</div>;
  if (!p) return <div className="min-h-screen flex items-center justify-center text-slate-500">Not found</div>;

  const verified = p.verification_status === "approved";
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address || ""} ${p.city} ${p.state} ${p.zip_code || ""}`)}`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10" data-testid="provider-ecard">
        {/* Section 32 — Floating header with back / like / share */}
        <ECardFloatingHeader provider={p} lang={lang} />

        {/* "Recomendado por X" hero banner — appears when arriving via ?via=share_token */}
        {refBy && (
          <div className="mb-4 rounded-2xl p-4 sm:p-5 flex items-start gap-3 shadow-sm" style={{ background: "linear-gradient(135deg, #FEE2E2 0%, #FEF3C7 100%)", borderLeft: "4px solid #DC2626" }} data-testid="ecard-referred-by-banner">
            <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-white font-display font-bold shadow-sm" style={{ background: "linear-gradient(135deg, #F87171 0%, #DC2626 100%)" }}>
              <Heart className="w-5 h-5 fill-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-red-700">
                {lang === "en" ? "Recommended by a friend" : "Recomendado por una persona"}
              </p>
              <p className="font-display font-semibold text-slate-900 mt-0.5 text-sm sm:text-base">
                <span className="text-red-700">{refBy.client_name}</span>
                {refBy.client_city && <span className="text-slate-500 text-xs font-normal"> · {refBy.client_city}</span>}
                {" "}
                {lang === "en" ? "vouches for this pro" : "lo/la recomienda"}
              </p>
              {refBy.message && (
                <p className="mt-1 text-sm text-slate-700 italic leading-relaxed">"{refBy.message}"</p>
              )}
            </div>
          </div>
        )}

        {/* Cover */}
        <div className="relative h-48 md:h-64 rounded-2xl overflow-hidden bg-slate-200">
          {p.cover_url && <img src={p.cover_url} alt="cover" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* Profile head */}
        <div className="relative -mt-12 md:-mt-16 px-4 md:px-8">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-slate-100 border-4 border-white shadow-md overflow-hidden -mt-16 md:-mt-20 flex-shrink-0">
                {p.logo_url ? <img src={buildFileUrl(p.logo_url)} alt="logo" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-blue-500 to-orange-500 flex items-center justify-center text-white font-display font-bold text-2xl">{p.business_name.charAt(0)}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900" data-testid="ecard-business-name">{p.business_name}</h1>
                  {verified && <span className="badge-verified" data-testid="ecard-verified-badge"><ShieldCheck className="w-3.5 h-3.5" /> {t("provider.verified")}</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  {p.category && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: `${p.category.color}15`, color: p.category.color }} data-testid="ecard-category-badge">
                      <CategoryIcon slug={p.category.slug} size={14} color={p.category.color} stroke={2} />
                      {lang === "es" ? p.category.name_es : p.category.name_en}
                    </span>
                  )}
                  <OwnerIdentityBadge identity={p.owner_identity} />
                  {p.founding_member && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200"><Award className="w-3 h-3" /> Founding</span>}
                  {p.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {p.city}, {p.state}</span>}
                  {p.rating_count > 0 && <span className="flex items-center gap-1 text-slate-800 font-medium"><Star className="w-3.5 h-3.5 fill-orange-500 text-orange-500" /> {p.rating_avg.toFixed(1)} ({p.rating_count})</span>}
                </div>
                {p.description && <p className="mt-4 text-slate-700 leading-relaxed">{p.description}</p>}

                {/* Section 33 — Engagement & gamification badges */}
                <EngagementBadges providerId={p.provider_id} />

                {p.recommendations_count > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold" data-testid="ecard-recommendations-badge">
                    <Heart className="w-3 h-3 fill-red-500" /> {p.recommendations_count} {lang === "en" ? "recommend" + (p.recommendations_count === 1 ? "s" : "") + " this pro" : `recomendaci${p.recommendations_count === 1 ? "ón" : "ones"}`}
                  </div>
                )}
                <div className="mt-4">
                  <LikeButton providerId={p.provider_id} initialCount={p.likes_count || 0} size="lg" />
                </div>
              </div>
            </div>

            {/* Section 32 — Primary CTA: WhatsApp full-width green */}
            <div className="mt-6 space-y-2.5">
              {p.phone ? (
                <WhatsAppButton phone={p.phone} businessName={p.business_name} testid="ecard-whatsapp-button" variant="primary" />
              ) : (
                <button
                  onClick={() => { setShowMessage(true); setMode("message"); }}
                  className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-3.5 px-6 rounded-2xl transition active:scale-[0.98] shadow-md"
                  data-testid="ecard-message-primary-button"
                >
                  <MessageSquare className="w-5 h-5" /> {lang === "en" ? "Send message" : "Enviar mensaje"}
                </button>
              )}

              {/* 2x2 grid of secondary CTAs */}
              <div className="grid grid-cols-2 gap-2" data-testid="ecard-secondary-cta-grid">
                {p.phone && (
                  <a href={`tel:${p.phone}`} onClick={trackClick} className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-teal-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition active:scale-[0.98] text-sm" data-testid="ecard-call-button">
                    <Phone className="w-4 h-4 text-teal-700" /> {t("provider.call")}
                  </a>
                )}
                <button onClick={() => { setShowMessage(true); setMode("message"); }} className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-teal-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition active:scale-[0.98] text-sm" data-testid="ecard-message-button">
                  <MessageSquare className="w-4 h-4 text-teal-700" /> {lang === "en" ? "Chat" : "Mensaje"}
                </button>
                <button onClick={() => setShowQuote(true)} className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-amber-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition active:scale-[0.98] text-sm" data-testid="ecard-quote-button">
                  <FileText className="w-4 h-4 text-amber-600" /> {lang === "en" ? "Quote" : "Cotizar"}
                </button>
                {p.calendar_active ? (
                  <button onClick={() => setShowBooking(true)} className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-teal-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition active:scale-[0.98] text-sm" data-testid="ecard-book-button">
                    <Calendar className="w-4 h-4 text-teal-700" /> {lang === "en" ? "Book" : "Reservar"}
                  </button>
                ) : (
                  <button
                    onClick={() => document.querySelector('[data-testid="ecard-gallery"], [data-testid="ecard-rates"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-teal-300 text-slate-700 font-semibold py-3 px-4 rounded-xl transition active:scale-[0.98] text-sm"
                    data-testid="ecard-services-button"
                  >
                    <Sparkles className="w-4 h-4 text-teal-700" /> {lang === "en" ? "Services" : "Servicios"}
                  </button>
                )}
              </div>

              {/* Tertiary actions — recommend + map + view eCard */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => setShowRecommend(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-red-200 hover:bg-red-50 transition"
                  style={{ background: "linear-gradient(135deg, #FEE2E2 0%, #FEF3C7 100%)", color: "#B91C1C" }}
                  data-testid="ecard-recommend-button"
                >
                  <Heart className="w-3.5 h-3.5 fill-red-500" />
                  {lang === "en" ? "I recommend" : "Lo/la recomiendo"}
                </button>
                {!p.is_home_based && p.city && (
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700 transition" data-testid="ecard-map-button">
                    <MapPin className="w-3.5 h-3.5" /> {t("provider.map")}
                  </a>
                )}
                <button onClick={() => setShowECardModal(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700 transition" data-testid="ecard-view-button">
                  <CreditCard className="w-3.5 h-3.5" /> {lang === "en" ? "View eCard" : "Ver eCard"}
                </button>
              </div>
            </div>
            <button onClick={addFavorite} className="mt-2 text-sm text-slate-500 hover:text-orange-500 flex items-center gap-1" data-testid="ecard-favorite-button">
              <Heart className="w-4 h-4" /> {lang === "en" ? "Save to favorites" : "Guardar en favoritos"}
            </button>
            {user && user.user_id !== p.user_id && (
              <button onClick={() => setShowReport(true)} className="ml-3 mt-2 text-xs text-slate-400 hover:text-red-600 inline-flex items-center gap-1" data-testid="ecard-report-button">
                <Flag className="w-3 h-3" /> Reportar este proveedor
              </button>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid md:grid-cols-3 gap-5 mt-6 px-4 md:px-8">
          <div className="md:col-span-2 space-y-5">
            {/* Licencia opcional (Sec 15) */}
            <LicenseBadge license={p.license} />

            {/* Presentation video (Pro/Premium) */}
            {p.video_url && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="ecard-video">
                <h3 className="font-display font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  🎬 Video de presentación
                </h3>
                <video
                  src={buildFileUrl(p.video_url)}
                  controls
                  preload="metadata"
                  className="w-full rounded-xl bg-black max-h-[480px]"
                  data-testid="ecard-video-player"
                />
              </div>
            )}

            {/* Gallery */}
            {p.gallery?.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="ecard-gallery">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-slate-900">{lang === "en" ? "Work gallery" : "Galería de trabajos"}</h3>
                  <span className="text-xs text-slate-500">{p.gallery.length} foto{p.gallery.length > 1 ? "s" : ""}</span>
                </div>
                <GalleryGrid items={p.gallery} testid="ecard-gallery-grid" />
              </div>
            )}
            {p.services?.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-display font-semibold text-slate-900 mb-3">{t("provider.services")}</h3>
                <div className="flex flex-wrap gap-2">
                  {p.services.map((s, i) => <span key={`svc-${s}-${i}`} className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm">{s}</span>)}
                </div>
              </div>
            )}

            {rates.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="ecard-rates">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="font-display font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-orange-500" /> Tarifas referenciales
                  </h3>
                  <button onClick={() => setShowQuote(true)} className="text-xs text-orange-600 font-semibold hover:underline" data-testid="ecard-rates-quote-cta">{lang === "en" ? "Request exact quote →" : "Pedir cotización exacta →"}</button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {rates.map(r => (
                    <li key={r.rate_id} className="py-3 flex items-start justify-between gap-3" data-testid={`ecard-rate-${r.rate_id}`}>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 text-sm">{r.service_name}</div>
                        {r.unit_note && <div className="text-xs text-slate-500 mt-0.5">{r.unit_note}</div>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="font-display font-bold text-slate-900 text-sm">{formatRate(r)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">Los precios son una referencia. Pide una cotización personalizada para tu proyecto.</p>
              </div>
            )}
            {p.service_areas?.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-display font-semibold text-slate-900 mb-3">{t("provider.areas")}</h3>
                <div className="flex flex-wrap gap-2">
                  {p.service_areas.map((a, i) => <span key={`area-${a}-${i}`} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm">{a}</span>)}
                </div>
              </div>
            )}

            {/* Community recommendations — public named endorsements */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <RecommendationsSection
                providerId={p.provider_id}
                refreshKey={recommendsRefreshKey}
                onRecommendClick={() => setShowRecommend(true)}
              />
            </div>

            {/* Reviews */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="font-display font-semibold text-slate-900 mb-4">{t("provider.reviews")}</h3>
              {user && user.role === "client" && (
                <form onSubmit={submitReview} className="mb-6 pb-6 border-b border-slate-100" data-testid="review-form">
                  <div className="flex items-center gap-1 mb-2">
                    {[1,2,3,4,5].map(n => (
                      <button type="button" key={n} onClick={() => setRating(n)} data-testid={`review-star-${n}`}>
                        <Star className={`w-6 h-6 ${n <= rating ? "fill-orange-500 text-orange-500" : "text-slate-300"}`} />
                      </button>
                    ))}
                  </div>
                  <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Comparte tu experiencia..." className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-600" rows={3} data-testid="review-comment-input" />
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">¿Cuánto pagaste? <span className="font-normal text-slate-500">(opcional, anónimo)</span></label>
                    <select value={paidRange} onChange={e => setPaidRange(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white" data-testid="review-paid-range">
                      <option value="">No quiero decir</option>
                      <option value="<100">Menos de $100</option>
                      <option value="100-300">$100 – $300</option>
                      <option value="300-700">$300 – $700</option>
                      <option value="700-1500">$700 – $1,500</option>
                      <option value=">1500">Más de $1,500</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">🔒 Nunca mostraremos esto en público. Solo nos ayuda a entender precios de mercado.</p>
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary mt-2 text-sm" data-testid="review-submit">Enviar reseña</button>
                </form>
              )}
              {p.reviews?.length > 0 ? (
                <div className="space-y-4">
                  {p.reviews.map(r => (
                    <div key={r.review_id} className="border-b border-slate-100 last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{r.user_name}</span>
                        <div className="flex">
                          {[...Array(r.rating)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />)}
                        </div>
                      </div>
                      {r.comment && <p className="text-slate-600 text-sm mt-1">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-slate-500 text-sm">Aún no hay reseñas.</p>}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm">
              <h3 className="font-display font-semibold text-slate-900 mb-3 flex items-center gap-1"><Clock className="w-4 h-4" /> {t("provider.hours")}</h3>
              <div className="space-y-1 text-slate-600">
                {Object.entries(p.hours || {}).map(([day, hrs]) => (
                  <div key={day} className="flex justify-between"><span className="capitalize">{day}</span><span>{hrs}</span></div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm space-y-3">
              {p.is_home_based ? (
                <div className="flex items-start gap-2 text-slate-700"><HomeIcon className="w-4 h-4 text-orange-500 mt-0.5" /> <span>Servicio móvil / desde casa{p.city ? ` · ${p.city}, ${p.state}` : ""}</span></div>
              ) : (
                p.address && <div className="flex items-start gap-2 text-slate-700"><MapPin className="w-4 h-4 text-slate-400 mt-0.5" /> {p.address}, {p.city}, {p.state} {p.zip_code}</div>
              )}
              {p.phone && <div className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400" /> {p.phone}</div>}
              {p.email && <div className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400" /> {p.email}</div>}
              {p.website && <div className="flex items-center gap-2 text-slate-700"><Globe className="w-4 h-4 text-slate-400" /> <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{p.website}</a></div>}
              {(p.social && Object.values(p.social).some(v => v)) && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Síguelo en redes</div>
                  <SocialLinks social={p.social} variant="compact" />
                </div>
              )}
              {p.languages?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-100">
                  {p.languages.map(l => <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{l.toUpperCase()}</span>)}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Section 32 — Share this eCard (link / QR / NFC) at the bottom */}
        <div className="mt-8" data-testid="ecard-share-block-wrap">
          <ShareECardBlock provider={p} lang={lang} />
        </div>

        {/* Message / Quote modal */}
        {showMessage && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowMessage(false)} data-testid="message-modal">
            <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-lg text-slate-900">{mode === "quote" ? `Pedir cotización a ${p.business_name}` : `Enviar mensaje a ${p.business_name}`}</h3>
                <button onClick={() => setShowMessage(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); mode === "quote" ? sendQuoteRequest() : sendMessage(e); }} className="space-y-3" data-testid="message-form">
                <input value={msgSubject} onChange={e => setMsgSubject(e.target.value)} placeholder={mode === "quote" ? "Tipo de servicio (ej. Limpieza profunda)" : "Asunto (ej. Cotización)"} className="w-full h-11 px-4 rounded-xl border border-slate-200 outline-none focus:border-blue-600" data-testid="message-subject-input" />
                <textarea required value={msgBody} onChange={e => setMsgBody(e.target.value)} placeholder={mode === "quote" ? "Cuéntale al proveedor qué necesitas, dónde, fecha aproximada..." : "Escribe tu mensaje..."} rows={5} className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-600" data-testid="message-body-input" />
                <button type="submit" className={`${mode === "quote" ? "btn-secondary" : "btn-primary"} w-full justify-center`} data-testid="message-send-submit">
                  {mode === "quote" ? "Enviar solicitud" : "Enviar mensaje"}
                </button>
                {!user && <p className="text-xs text-slate-500 text-center">Necesitas iniciar sesión.</p>}
              </form>
            </div>
          </div>
        )}

        {showECardModal && <ECardModal provider={p} onClose={() => setShowECardModal(false)} />}
        <QuoteRequestModal open={showQuote} provider={p} onClose={() => setShowQuote(false)} />
        <BookingModal open={showBooking} provider={p} onClose={() => setShowBooking(false)} onBooked={() => trackClick()} />
        <RecommendModal
          open={showRecommend}
          provider={p}
          onClose={() => setShowRecommend(false)}
          onSubmitted={() => setRecommendsRefreshKey(k => k + 1)}
        />
        <ReportModal
          open={showReport}
          onClose={() => setShowReport(false)}
          targetId={p.user_id}
          targetRole="provider"
          targetName={p.business_name}
          context={{ provider_slug: p.slug }}
        />
      </main>
      <Footer />
    </div>
  );
}
