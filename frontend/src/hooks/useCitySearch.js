/**
 * useCitySearch — Section 42.
 *
 * Wraps Google Places AutocompleteService restricted to US cities/towns
 * (no street addresses). Includes a 300ms debounce and a graceful
 * fallback to the static `usLocations.js` list when Maps JS has not
 * loaded yet (offline mode, blocked script, etc.).
 *
 * Returns:
 *   { query, handleQueryChange, results, loading, clear, isFallback }
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getCitiesByState } from "../data/usLocations";

const STATE_ABBR_MAP = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
  "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
  "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA",
  "Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD",
  "Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO",
  "Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ",
  "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH",
  "Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
  "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
  "Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY",
  "District of Columbia":"DC",
};

export default function useCitySearch(stateName) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const autocomplete = useRef(null);
  const debounceTimer = useRef(null);

  // Try to initialize Places. If Maps isn't loaded after 2s, switch to fallback.
  useEffect(() => {
    if (window.google?.maps?.places) {
      autocomplete.current = new window.google.maps.places.AutocompleteService();
      return undefined;
    }
    const fallbackTimer = setTimeout(() => {
      if (window.google?.maps?.places) {
        autocomplete.current = new window.google.maps.places.AutocompleteService();
      } else {
        setIsFallback(true);
      }
    }, 2000);
    return () => clearTimeout(fallbackTimer);
  }, []);

  const runFallback = useCallback((input) => {
    if (!stateName) {
      setResults([]);
      return;
    }
    const stateAbbr = STATE_ABBR_MAP[stateName] || stateName;
    const cities = getCitiesByState(stateAbbr) || getCitiesByState(stateName);
    const filtered = cities
      .filter((c) => c.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 6)
      .map((city) => ({
        city,
        state: stateName,
        stateAbbr,
        fullLabel: `${city}, ${stateAbbr}`,
      }));
    setResults(filtered);
  }, [stateName]);

  const search = useCallback((input) => {
    if (!input || input.length < 2) {
      setResults([]);
      return;
    }
    if (isFallback || !autocomplete.current) {
      runFallback(input);
      return;
    }
    setLoading(true);
    const searchQuery = stateName ? `${input}, ${stateName}` : input;
    autocomplete.current.getPlacePredictions(
      {
        input: searchQuery,
        types: ["(cities)"],
        componentRestrictions: { country: "us" },
      },
      (predictions, status) => {
        setLoading(false);
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
          // Fall back if the API errored
          runFallback(input);
          return;
        }
        const parsed = predictions.slice(0, 6).map((p) => {
          const parts = (p.description || "").split(", ");
          const city = parts[0] || "";
          const stateRaw = parts[1] || "";
          const stateAbbr = STATE_ABBR_MAP[stateRaw] || stateRaw.slice(0, 2).toUpperCase();
          return { city, state: stateRaw, stateAbbr, fullLabel: `${city}, ${stateAbbr}` };
        });
        setResults(parsed);
      },
    );
  }, [stateName, isFallback, runFallback]);

  const handleQueryChange = (value) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(value), 300);
  };

  const clear = () => {
    setQuery("");
    setResults([]);
  };

  return { query, handleQueryChange, results, loading, clear, isFallback };
}
