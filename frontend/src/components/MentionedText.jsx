import { Link } from "react-router-dom";

/**
 * MentionedText — Section 47 — parses `@handle` patterns inside any post or
 * comment body and renders them as clickable teal links to /u/{handle}.
 *
 * Regex notes:
 *  · Matches `@` followed by 3+ alphanumerics/underscores/dots (Spanish + EN).
 *  · Does NOT match emails (preceded by alpha char) — checks the boundary.
 *  · Preserves the surrounding whitespace + punctuation as plain text.
 */
const MENTION_RE = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_.]{3,30})/g;

export default function MentionedText({ text, className = "" }) {
  if (!text) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  // Reset regex state in case we are re-using the global regex on re-renders.
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    const [full, prefix, handle] = match;
    const start = match.index + prefix.length;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    parts.push(
      <Link
        key={`${start}-${handle}`}
        to={`/u/${handle}`}
        className="text-teal-700 font-semibold hover:underline"
        data-testid={`mention-${handle}`}
      >
        @{handle}
      </Link>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <span className={className}>{parts}</span>;
}
