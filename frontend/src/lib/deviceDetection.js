/**
 * deviceDetection.js — single source of truth for device + browser
 * detection used by the Install Modal, the /instalar landing, and any
 * banner that needs to route the user to the correct install path.
 *
 * iOS PWAs can ONLY be installed from real Safari (Apple restriction —
 * Chrome/Edge/Firefox/Brave on iOS all wrap WebKit and the "Add to Home
 * Screen" share sheet entry is hidden). Android Chrome and Edge fire
 * `beforeinstallprompt`; Samsung Internet does NOT, requiring manual
 * instructions instead.
 */

export function detectDevice() {
  if (typeof navigator === "undefined") {
    return {
      os: "unknown", browser: "unknown",
      isMobile: false, isIOS: false, isAndroid: false,
      isStandalone: false,
      canInstallAndroid: false, canInstallIOS: false, canInstallSamsung: false,
    };
  }
  const ua = navigator.userAgent || "";

  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/i.test(ua);

  // iOS sub-browsers (all are WebKit wrappers per Apple)
  const isIOSChrome = /CriOS/.test(ua);
  const isIOSEdge = /EdgiOS/.test(ua);
  const isIOSFirefox = /FxiOS/.test(ua);
  const isIOSOpera = /OPiOS/.test(ua);
  const isIOSBrave = /Brave/.test(ua) && isIOS;
  const isIOSNonSafari = isIOS && (isIOSChrome || isIOSEdge || isIOSFirefox || isIOSOpera || isIOSBrave);
  const isIOSSafari = isIOS && /Safari/.test(ua) && !isIOSNonSafari;

  // Android browsers
  const isSamsungBrowser = /SamsungBrowser/.test(ua);
  const isAndroidChrome = isAndroid && /Chrome/.test(ua) && !isSamsungBrowser && !/EdgA|OPR/.test(ua);
  const isAndroidEdge = isAndroid && /EdgA/.test(ua);

  let os = "desktop";
  if (isIOS) os = "ios";
  else if (isAndroid) os = "android";

  let browser = "other";
  if (isIOSSafari) browser = "safari";
  else if (isIOSChrome) browser = "chrome-ios";
  else if (isIOSEdge) browser = "edge-ios";
  else if (isIOSFirefox) browser = "firefox-ios";
  else if (isIOSNonSafari) browser = "non-safari-ios";
  else if (isSamsungBrowser) browser = "samsung";
  else if (isAndroidChrome) browser = "chrome-android";
  else if (isAndroidEdge) browser = "edge-android";
  else if (isAndroid) browser = "android-other";

  const isStandalone = (typeof window !== "undefined") && (
    window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
  );

  // Try to identify common iPhone bodies (helpful for splash screens later)
  let iosModel = null;
  if (isIOS && typeof window !== "undefined") {
    const w = window.screen.width;
    const h = window.screen.height;
    if (w === 375 && h === 667) iosModel = "iphone-se";
    else if (w === 375 && h === 812) iosModel = "iphone-x-mini";
    else if (w === 390 && h === 844) iosModel = "iphone-13-14";
    else if (w === 393 && h === 852) iosModel = "iphone-15-16";
    else if (w === 402 && h === 874) iosModel = "iphone-17";
    else if (w === 430 && h === 932) iosModel = "iphone-15-plus";
    else if (w === 440 && h === 956) iosModel = "iphone-pro-max";
    else iosModel = "iphone-unknown";
  }

  return {
    os, browser, iosModel,
    isMobile: isIOS || isAndroid,
    isIOS, isAndroid, isIOSSafari, isIOSNonSafari, isSamsungBrowser,
    isStandalone,
    // Capability flags — answers "can the user install with one tap right now?"
    canInstallAndroid: isAndroidChrome || isAndroidEdge,
    canInstallIOS: isIOSSafari,            // Safari only (Apple restriction)
    canInstallSamsung: isSamsungBrowser,    // Manual instructions, no native prompt
  };
}

export function isStandalonePWA() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

const DECLINED_KEY = "getamano_install_declined_at";
const DECLINE_COOLDOWN_DAYS = 14;

export function hasRecentlyDeclined() {
  try {
    const ts = parseInt(localStorage.getItem(DECLINED_KEY) || "0", 10);
    if (!ts) return false;
    return (Date.now() - ts) < DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch (_e) { return false; }
}

export function markInstallDeclined() {
  try { localStorage.setItem(DECLINED_KEY, String(Date.now())); } catch (_e) { /* ignore */ }
}

/**
 * Track that the user successfully installed. Called from `appinstalled`
 * (Android) and from the first standalone-mode launch (iOS, manual).
 */
export function trackPwaInstalled(platform) {
  try {
    // PostHog (already on the page — see public/index.html)
    if (typeof window !== "undefined" && window.posthog) {
      window.posthog.capture("pwa_installed", { platform });
    }
    // GA4 (gtag, only fires if ga script is present)
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "pwa_install", { platform });
    }
  } catch (_e) { /* ignore */ }
}

/**
 * iOS-specific: detect first launch in standalone mode and fire the install
 * event exactly once (Apple has no `appinstalled` event on iOS Safari).
 * Call this from a top-level mount.
 */
export function trackIOSFirstLaunchOnce() {
  if (!isStandalonePWA()) return;
  try {
    const KEY = "getamano_pwa_first_launch_tracked";
    if (localStorage.getItem(KEY)) return;
    localStorage.setItem(KEY, String(Date.now()));
    trackPwaInstalled("ios");
  } catch (_e) { /* ignore */ }
}
