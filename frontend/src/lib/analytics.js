/**
 * Section 18G — Google Analytics 4 helpers.
 *
 * Activation: set REACT_APP_GA4_MEASUREMENT_ID=G-XXXXXXXXXX in /app/frontend/.env then restart.
 * Without a valid Measurement ID the helpers are NO-OPS (safe to call anywhere).
 *
 * Loads the gtag.js script on first import, then exposes typed tracking helpers.
 */

const MID = process.env.REACT_APP_GA4_MEASUREMENT_ID;
const ENABLED = !!MID && MID.startsWith("G-");

let _loaded = false;

function loadGtag() {
  if (_loaded || !ENABLED || typeof window === "undefined") return;
  _loaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MID, { send_page_view: false });
}
loadGtag();

function _send(eventName, params = {}) {
  if (!ENABLED || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

export const trackPageView = (path) => _send("page_view", { page_path: path, page_location: window.location.href });
export const trackProviderView = (slug, category, city) => _send("provider_profile_view", { provider_slug: slug, category, city });
export const trackQuoteRequest = (category, city, planTier) => _send("quote_request", { category, city, plan_tier: planTier });
export const trackProviderRegistration = (plan) => _send("sign_up", { method: "provider", plan });
export const trackPlanUpgrade = (fromPlan, toPlan) => _send("purchase", {
  currency: "USD",
  value: toPlan === "basic" ? 10 : toPlan === "pro" ? 15 : toPlan === "premium" ? 25 : 0,
  items: [{ item_name: `Plan ${toPlan}`, item_id: toPlan }],
  from_plan: fromPlan,
});
export const trackBooking = (providerSlug, category) => _send("booking_request", { provider_slug: providerSlug, category });
export const trackSearch = (term, city, category, resultsCount) => _send("search", {
  search_term: term, city, category, results_count: resultsCount,
});
export const trackLanguageSwitch = (toLang) => _send("language_switch", { language: toLang });
export const trackJobInterest = (jobTitle, city) => _send("job_interest", { job_title: jobTitle, city });
export const trackCardScan = (result) => _send("card_scan", { result });

export const isAnalyticsEnabled = () => ENABLED;
