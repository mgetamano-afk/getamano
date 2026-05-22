/**
 * Register the service worker as soon as the app boots. We register it
 * AFTER the main bundle has loaded so it never blocks the first render.
 *
 * On localhost we register too — Chrome considers localhost a secure context
 * so it works for dev. In production (HTTPS), works everywhere.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Register after window load so we don't compete with critical resources
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((reg) => {
        // Listen for updates and ask the SW to activate immediately
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[PWA] SW registration failed:", err);
      });

    // Reload the page once the new SW takes control (so user sees fresh code)
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      // Use a small delay so it's not jarring during navigation
      setTimeout(() => window.location.reload(), 50);
    });
  });
}
