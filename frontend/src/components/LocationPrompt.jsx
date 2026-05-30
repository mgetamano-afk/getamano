import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Navigation, X, Loader2 } from "lucide-react";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";

/**
 * LocationPrompt — V7 Item 4.
 *
 * Asks the visitor to pin their city the first time they land on
 * `/search` (or any consumer that mounts this component). Two paths:
 *   1. "Usar mi ubicación" → browser geolocation + reverse-geocode via
 *      our backend `/geo/reverse` endpoint if available, else fall back
 *      to manual entry on failure.
 *   2. Manual entry → simple "Ciudad, Estado" field.
 *
 * Persists `{city, state}` to `localStorage.search_city` /
 * `search_state` and fires `onConfirm({city, state})`. If the user
 * dismisses the modal we set `search_city_skipped=1` so we don't ask
 * again the same session.
 */

const STORAGE_CITY = "search_city";
const STORAGE_STATE = "search_state";
const STORAGE_SKIP = "search_city_skipped";

export function readSavedLocation() {
  try {
    return {
      city: localStorage.getItem(STORAGE_CITY) || "",
      state: localStorage.getItem(STORAGE_STATE) || "",
    };
  } catch {
    return { city: "", state: "" };
  }
}

export function saveLocation(city, state) {
  try {
    if (city) localStorage.setItem(STORAGE_CITY, city);
    else localStorage.removeItem(STORAGE_CITY);
    if (state) localStorage.setItem(STORAGE_STATE, state);
    else localStorage.removeItem(STORAGE_STATE);
  } catch { /* noop */ }
}

export function clearLocation() {
  try {
    localStorage.removeItem(STORAGE_CITY);
    localStorage.removeItem(STORAGE_STATE);
    localStorage.removeItem(STORAGE_SKIP);
  } catch { /* noop */ }
}

export default function LocationPrompt({ open, onClose, onConfirm }) {
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [hint, setHint] = useState(null);

  // Hide if user explicitly skipped this session
  useEffect(() => {
    try { if (sessionStorage.getItem(STORAGE_SKIP) === "1") onClose?.(); } catch {}
  }, [onClose]);

  const useMyLocation = async () => {
    if (!navigator.geolocation) {
      setHint(lang === "en" ? "Your browser doesn't support geolocation." : "Tu navegador no soporta geolocalización.");
      return;
    }
    setBusy(true); setHint(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        // Best-effort reverse geocode via backend; if endpoint missing
        // we still let the user type the city manually below.
        const r = await api.get("/geo/reverse", {
          params: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        const c = r.data?.city || "";
        const s = r.data?.state || "";
        if (c) {
          saveLocation(c, s);
          onConfirm?.({ city: c, state: s });
          onClose?.();
        } else {
          setHint(lang === "en" ? "We couldn't read your city — enter it below." : "No pudimos leer tu ciudad — escríbela abajo.");
        }
      } catch {
        setHint(lang === "en" ? "Reverse geocode failed — enter your city below." : "No pudimos resolverla — escríbela abajo.");
      } finally { setBusy(false); }
    }, () => {
      setBusy(false);
      setHint(lang === "en" ? "Couldn't access your location." : "No pudimos acceder a tu ubicación.");
    }, { timeout: 8000 });
  };

  const submitManual = () => {
    const c = city.trim();
    const s = state.trim().toUpperCase();
    if (!c) { setHint(lang === "en" ? "City is required." : "La ciudad es obligatoria."); return; }
    saveLocation(c, s);
    onConfirm?.({ city: c, state: s });
    onClose?.();
  };

  const skip = () => {
    try { sessionStorage.setItem(STORAGE_SKIP, "1"); } catch { /* noop */ }
    onClose?.();
  };

  if (!open) return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) skip(); }}
      data-testid="location-prompt"
    >
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 md:pt-5 pb-2">
          <h3 className="font-display font-bold text-lg text-slate-900 inline-flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#0077B6]" />
            {lang === "en" ? "Where are you?" : "¿Dónde estás?"}
          </h3>
          <button
            type="button"
            onClick={skip}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
            aria-label={lang === "en" ? "Skip" : "Saltar"}
            data-testid="location-prompt-skip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <p className="text-sm text-slate-600">
            {lang === "en"
              ? "We'll prioritize providers near you. Change it anytime."
              : "Vamos a priorizar proveedores cerca tuyo. Lo cambias cuando quieras."}
          </p>

          <button
            type="button"
            onClick={useMyLocation}
            disabled={busy}
            className="w-full h-11 rounded-full bg-[#0077B6] hover:bg-[#005f93] text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition"
            data-testid="location-prompt-geo"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            {lang === "en" ? "Use my location" : "Usar mi ubicación"}
          </button>

          <div className="relative flex items-center gap-2 text-xs text-slate-400">
            <span className="flex-1 h-px bg-slate-200" />
            {lang === "en" ? "or" : "o"}
            <span className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={lang === "en" ? "City" : "Ciudad"}
              className="col-span-2 h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20"
              data-testid="location-prompt-city-input"
            />
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="ST"
              className="h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#0077B6]/20 uppercase"
              data-testid="location-prompt-state-input"
            />
          </div>

          {hint && (
            <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded-lg" data-testid="location-prompt-hint">
              {hint}
            </p>
          )}

          <button
            type="button"
            onClick={submitManual}
            disabled={!city.trim()}
            className="w-full h-11 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold disabled:opacity-40 active:scale-95 transition"
            data-testid="location-prompt-confirm"
          >
            {lang === "en" ? "Use this location" : "Usar esta ubicación"}
          </button>

          <button
            type="button"
            onClick={skip}
            className="w-full h-9 text-xs text-slate-500 hover:text-slate-700"
            data-testid="location-prompt-skip-link"
          >
            {lang === "en" ? "Search all of the US" : "Buscar en toda EE.UU."}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
