import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/analytics";

/**
 * Section 18G — fires GA4 page_view on every React Router transition.
 * Mount inside <BrowserRouter> at the top level (App.js).
 */
export default function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
}
