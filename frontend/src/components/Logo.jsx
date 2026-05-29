import { Link } from "react-router-dom";

/**
 * Official getamano logo component.
 * variant: "mark" (icon only) | "full" (icon + wordmark, stacked) | "inline" (icon + horizontal text)
 * size: tailwind size class like "w-9 h-9" or pixel number for full image
 */
export default function Logo({ variant = "inline", size = "w-9 h-9", linkTo = "/", className = "", showText = true, textClassName = "" }) {
  const markSrc = "/getamano-logo-mark.png";
  const fullSrc = "/getamano-logo-full.png";

  const inner =
    variant === "full" ? (
      <img src={fullSrc} alt="getamano" className={`object-contain ${typeof size === "string" ? size : ""}`} style={typeof size === "number" ? { height: size, width: "auto" } : undefined} />
    ) : (
      <div className="flex items-center gap-2">
        <img src={markSrc} alt="getamano" className={`object-contain ${size}`} />
        {showText && variant === "inline" && (
          <span className={`font-display font-bold text-xl ${textClassName}`} style={textClassName ? undefined : { color: "#03045E" }}>
            get<span style={{ color: "#0077B6" }}>amano</span>
          </span>
        )}
      </div>
    );

  if (linkTo) {
    return (
      <Link to={linkTo} className={`flex items-center ${className}`} data-testid="brand-logo-link" aria-label="getamano home">
        {inner}
      </Link>
    );
  }
  return <div className={className} data-testid="brand-logo">{inner}</div>;
}
