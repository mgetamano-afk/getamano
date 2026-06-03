import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/**
 * MentionTextarea — V17.4 textarea with @-mention autocomplete.
 *
 * Detects the active @-token at the caret and queries
 * /api/mentions/search to populate a dropdown. Selecting a suggestion
 * replaces the in-progress handle with the resolved slug. Used in
 * comments composer and caption inputs.
 *
 * Props:
 *   value, onChange — controlled text input
 *   placeholder, disabled — passthroughs
 *   testid — base test id; we add -input / -dropdown / -item suffixes
 */
export default function MentionTextarea({ value, onChange, placeholder, disabled, testid = "mention" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const taRef = useRef(null);
  const dropdownRef = useRef(null);

  // Detect the @-token at the current caret position. Returns the
  // partial handle (without @) or null if we're not inside one.
  const getActiveMentionToken = () => {
    const ta = taRef.current;
    if (!ta) return null;
    const text = ta.value || "";
    const caret = ta.selectionStart || 0;
    // Walk backwards from caret to find the closest @ that isn't preceded
    // by a word char.
    let i = caret - 1;
    let handle = "";
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        // Make sure the @ isn't part of an email
        const prev = i > 0 ? text[i - 1] : "";
        if (/\w/.test(prev)) return null;
        return { start: i, end: caret, handle };
      }
      if (!/[a-zA-Z0-9._-]/.test(ch)) return null;
      handle = ch + handle;
      i--;
      if (handle.length > 60) return null;
    }
    return null;
  };

  // Debounced fetch
  useEffect(() => {
    const token = getActiveMentionToken();
    if (!token || token.handle.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const t = setTimeout(() => {
      api.get(`/mentions/search?q=${encodeURIComponent(token.handle)}`)
        .then(({ data }) => {
          setSuggestions(data.items || []);
          setShowSuggestions((data.items || []).length > 0);
          setActiveIndex(0);
        })
        .catch(() => { setSuggestions([]); setShowSuggestions(false); });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pick = (handle) => {
    const ta = taRef.current;
    const token = getActiveMentionToken();
    if (!ta || !token) return;
    const text = ta.value;
    const before = text.slice(0, token.start);
    const after = text.slice(token.end);
    const next = `${before}@${handle} ${after}`;
    onChange(next);
    setShowSuggestions(false);
    // Re-focus the textarea AFTER state flush so caret lands right
    // after the inserted handle + space.
    requestAnimationFrame(() => {
      const newCaret = before.length + handle.length + 2;
      ta.focus();
      ta.setSelectionRange(newCaret, newCaret);
    });
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex].handle);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative flex-1">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 focus:border-fuchsia-500 outline-none text-sm resize-none disabled:bg-slate-50"
        data-testid={`${testid}-input`}
      />
      {showSuggestions && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-60 overflow-y-auto z-50"
          data-testid={`${testid}-dropdown`}
        >
          {suggestions.map((s, idx) => (
            <button
              key={s.user_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s.handle); }}
              className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 text-left ${idx === activeIndex ? "bg-fuchsia-50" : ""}`}
              data-testid={`${testid}-item-${s.handle}`}
            >
              {s.picture ? (
                <img src={s.picture} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                  {(s.name || "U")[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1">
                  {s.name}
                  {s.verified && <span className="text-emerald-600 text-xs">✓</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">@{s.handle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
