/**
 * EmptyState — Section 59.
 *
 * Reusable empty-state for any section that may have no content:
 *   - search returned nothing
 *   - community feed is empty
 *   - user has no saved eCards
 *   - inbox is empty
 *   - jobs board is empty
 *   - reviews are empty
 *
 * Props:
 *   icon              required ReactNode — usually a lucide icon
 *   title             required string
 *   subtitle          string
 *   primaryAction     { label, onClick }
 *   secondaryAction   { label, onClick }
 *   tip               small footer hint
 *   tags              array of { label, onClick } pills for quick navigation
 *   testid            string
 */
export default function EmptyState({
  icon,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  tip,
  tags,
  testid = "empty-state",
}) {
  return (
    <div
      className="text-center px-6 py-12 max-w-md mx-auto"
      data-testid={testid}
    >
      <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 flex items-center justify-center text-teal-700">
        {icon}
      </div>

      <h3 className="font-display font-bold text-xl text-slate-800 mb-1.5" data-testid={`${testid}-title`}>
        {title}
      </h3>

      {subtitle && (
        <p className="text-sm text-slate-500 leading-relaxed mb-5" data-testid={`${testid}-subtitle`}>
          {subtitle}
        </p>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-4">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
              data-testid={`${testid}-primary`}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium transition"
              data-testid={`${testid}-secondary`}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}

      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mt-4" data-testid={`${testid}-tags`}>
          {tags.map((tag, i) => (
            <button
              key={`${tag.label}-${i}`}
              type="button"
              onClick={tag.onClick}
              className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-full border border-teal-100 transition"
              data-testid={`${testid}-tag-${i}`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}

      {tip && (
        <p className="text-xs text-slate-400 mt-6" data-testid={`${testid}-tip`}>
          {tip}
        </p>
      )}
    </div>
  );
}
