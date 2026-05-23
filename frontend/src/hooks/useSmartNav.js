/**
 * useSmartNav — Section 41 / Correction #2.
 *
 * Returns `true` when the nav should be visible, `false` when it should be
 * hidden. Mimics Facebook/Instagram behavior:
 *  · always visible in the top ~60px of the page
 *  · hide when scrolling DOWN with velocity (>6px delta)
 *  · re-show when scrolling UP (>4px delta)
 *
 * Apply this hook to your top header, your sticky tab bars, and your
 * bottom nav — the only difference is the direction of the hide transform.
 */
import { useEffect, useRef, useState } from "react";

export default function useSmartNav() {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastScrollY.current;
        if (y < 60) {
          setIsVisible(true);
        } else if (delta > 6) {
          setIsVisible(false);
        } else if (delta < -4) {
          setIsVisible(true);
        }
        lastScrollY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return isVisible;
}
