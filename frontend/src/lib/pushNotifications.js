/**
 * Browser notifications opt-in helper (no Service Worker required).
 *
 * Strategy: poll the existing PUBLIC `/api/activity-feed` endpoint, compare the
 * latest item's `at` timestamp against localStorage, and fire one system
 * notification per new event. Works for anonymous visitors and logged-in users.
 *
 * For full server-pushed notifications when the tab is closed, we'd add a
 * Service Worker + VAPID + Web Push later — out of scope for v1.
 */

const LS_LAST_SEEN = "gm_push_last_seen_at";
const LS_DISMISSED_AT = "gm_push_opt_dismissed_at";
const LS_GRANTED = "gm_push_granted";
const DISMISS_TTL_DAYS = 30;
const POLL_INTERVAL_MS = 90_000;
const MAX_NOTIFICATIONS_PER_POLL = 2;
const ICON_URL = "/icon-192.png";

export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getPermission() {
  if (!isSupported()) return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") localStorage.setItem(LS_GRANTED, "1");
    return result;
  } catch (e) {
    console.error("[push] requestPermission failed", e);
    return "denied";
  }
}

export function dismissOptIn() {
  localStorage.setItem(LS_DISMISSED_AT, String(Date.now()));
}

export function isOptInDismissed() {
  const at = parseInt(localStorage.getItem(LS_DISMISSED_AT) || "0", 10);
  if (!at) return false;
  const ageDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
  return ageDays < DISMISS_TTL_DAYS;
}

export function wasGranted() {
  return localStorage.getItem(LS_GRANTED) === "1" && getPermission() === "granted";
}

function _notify(title, body, url) {
  if (getPermission() !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: ICON_URL,
      badge: ICON_URL,
      tag: url, // collapses repeat events with same url
      renotify: false,
    });
    n.onclick = (e) => {
      e.preventDefault();
      window.focus();
      if (url) window.open(url, "_blank");
      n.close();
    };
  } catch (err) {
    console.error("[push] notify failed", err);
  }
}

let _pollHandle = null;

export function startActivityFeedPolling(api, getLang) {
  if (_pollHandle) return; // already running
  if (getPermission() !== "granted") return;

  const poll = async () => {
    try {
      const r = await api.get("/activity-feed", { params: { limit: 5 } });
      const items = Array.isArray(r.data?.items) ? r.data.items : [];
      if (items.length === 0) return;

      const lastSeen = localStorage.getItem(LS_LAST_SEEN) || "";
      // Filter new items (strictly newer than lastSeen)
      const fresh = items.filter((it) => (it.at || "") > lastSeen);
      if (fresh.length === 0) return;

      // On first run after grant, seed last_seen so we DON'T spam old events
      if (!lastSeen) {
        localStorage.setItem(LS_LAST_SEEN, items[0].at || new Date().toISOString());
        return;
      }

      const lang = (getLang && getLang()) || "es";
      const toFire = fresh.slice(0, MAX_NOTIFICATIONS_PER_POLL);
      for (const it of toFire) {
        const body = lang === "es" ? it.text_es : it.text_en;
        const title = lang === "es" ? "getamano · novedad" : "getamano · update";
        const url = it.link ? new URL(it.link, window.location.origin).href : window.location.origin;
        _notify(title, body || "", url);
      }
      // Advance pointer to the newest item we saw, not just the ones we fired.
      localStorage.setItem(LS_LAST_SEEN, items[0].at || new Date().toISOString());
    } catch (e) {
      console.error("[push] poll failed", e);
    }
  };

  // Initial small delay so we don't fire immediately after grant.
  const initial = setTimeout(poll, 10_000);
  const interval = setInterval(poll, POLL_INTERVAL_MS);
  _pollHandle = { initial, interval };
}

export function stopActivityFeedPolling() {
  if (!_pollHandle) return;
  clearTimeout(_pollHandle.initial);
  clearInterval(_pollHandle.interval);
  _pollHandle = null;
}
