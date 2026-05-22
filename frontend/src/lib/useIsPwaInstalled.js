import { useEffect, useState } from "react";

/**
 * useIsPwaInstalled — true when the page is running in standalone mode
 * (i.e. user installed the PWA and launched it from their home screen).
 *
 * Re-checks if `display-mode: standalone` becomes true while the page
 * is open (rare, but happens after a fresh install).
 */
export default function useIsPwaInstalled() {
  const [installed, setInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = (e) => setInstalled(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);

    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return installed;
}
