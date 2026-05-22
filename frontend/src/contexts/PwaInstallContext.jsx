import { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * PwaInstallContext — single source of truth for PWA install state.
 *
 * Listens for `beforeinstallprompt` ONCE at app level and exposes:
 *   - canInstallAndroid: native install dialog ready to fire
 *   - install(): triggers the system prompt (Android Chrome / Edge / Samsung)
 *   - isInstalled: standalone display-mode (already installed)
 *   - isIOS: iOS Safari needs manual instructions (Apple has no programmatic install)
 *   - isAndroid: Android device detected
 *
 * Used by both:
 *   - <InstallButtons /> on Landing (the prominent "Download for X" CTAs)
 *   - <InstallPrompt /> floating banner (auto-appears for unaware users)
 */

const PwaInstallContext = createContext(null);

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPad reports as Mac in iOS 13+ — also check touch points
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
  return ua.includes("Mac") && navigator.maxTouchPoints > 1;
}
function detectAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}
function detectStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
}

export function PwaInstallProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(detectStandalone());
  const isIOS = detectIOS();
  const isAndroid = detectAndroid();

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return { outcome: "no-prompt" };
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice;
  }, [deferredPrompt]);

  const value = {
    canInstallAndroid: !!deferredPrompt,
    install,
    isInstalled,
    isIOS,
    isAndroid,
    deferredPrompt,
  };

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) throw new Error("usePwaInstall must be used within PwaInstallProvider");
  return ctx;
}
