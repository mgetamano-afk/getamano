/**
 * Push subscription helper — Section 68.
 *
 * Thin wrapper around the Web Push API. Handles:
 *  · Fetching the VAPID public key from /api/push/public-key
 *  · Asking the user for Notification permission
 *  · Registering the subscription with /api/push/subscribe
 *  · Removing it with /api/push/unsubscribe
 *
 * Browsers without Service Worker support, iOS Safari without
 * `Notification.requestPermission`, and the legacy fetch failure modes
 * are all gracefully ignored — never throws.
 */
import { api } from "./api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const pushSupported = () =>
  typeof window !== "undefined"
  && "serviceWorker" in navigator
  && "PushManager" in window
  && "Notification" in window;

export const pushPermission = () => (typeof Notification !== "undefined" ? Notification.permission : "default");

export async function ensurePushSubscription() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "denied") return { ok: false, reason: "denied" };

  // Ask permission if still default
  let perm = Notification.permission;
  if (perm === "default") {
    try { perm = await Notification.requestPermission(); }
    catch { return { ok: false, reason: "permission_failed" }; }
  }
  if (perm !== "granted") return { ok: false, reason: perm };

  let registration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    return { ok: false, reason: "sw_not_ready" };
  }

  // Fetch VAPID public key
  let publicKey;
  try {
    const { data } = await api.get("/push/public-key");
    publicKey = data?.public_key;
  } catch {
    return { ok: false, reason: "no_vapid" };
  }
  if (!publicKey) return { ok: false, reason: "no_vapid" };

  // Subscribe with the push manager
  let sub;
  try {
    sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
  } catch (e) {
    return { ok: false, reason: "subscribe_failed", error: String(e).slice(0, 200) };
  }

  // Persist on the server
  const json = sub.toJSON();
  try {
    await api.post("/push/subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      user_agent: navigator.userAgent.slice(0, 250),
    });
  } catch {
    return { ok: false, reason: "register_failed" };
  }

  return { ok: true, endpoint: json.endpoint };
}

export async function removePushSubscription() {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    await api.post("/push/unsubscribe", { endpoint: json.endpoint }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* ignore */ }
}

/**
 * Section 89 v4 (Phase C) — Trigger a test push to the current user.
 * Resolves to `{ ok, ...serverPayload }`. Used by the
 * `<NotificationsSettingsCard>` "Send test" button so the user can
 * verify the full delivery path without waiting for a real event.
 */
export async function sendTestPush() {
  try {
    const { data } = await api.post("/push/test");
    return { ok: true, ...data };
  } catch (e) {
    const status = e?.response?.status;
    return { ok: false, reason: status === 503 ? "no_vapid" : "send_failed" };
  }
}
