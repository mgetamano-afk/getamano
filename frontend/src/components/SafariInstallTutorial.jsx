/**
 * SafariInstallTutorial — pure-SVG animated demo that shows an iPhone
 * with Safari open and a "ghost finger" tapping the Share button, then
 * "Add to Home Screen", then the app appearing on the home screen.
 *
 * No GIF: inline SVG + CSS keyframes → crisp on retina, ~3KB, accessible.
 * Loops every 8 seconds.
 *
 *   0.0–2.5s  Browser visible · finger pulses over Share icon
 *   2.5–5.0s  Share sheet slides up · finger moves to "Add to Home Screen"
 *   5.0–6.5s  Home screen reveals · getamano icon "pops" in
 *   6.5–8.0s  Success checkmark fades · loop restart
 */

const STYLE = `
@keyframes gtm-fadeStep {
  0%, 30% { opacity: 1; }
  31%, 60% { opacity: 0; }
  61%, 70% { opacity: 0; }
  71%, 100% { opacity: 0; }
}
@keyframes gtm-fadeStep2 {
  0%, 30% { opacity: 0; }
  31%, 60% { opacity: 1; }
  61%, 100% { opacity: 0; }
}
@keyframes gtm-fadeStep3 {
  0%, 60% { opacity: 0; }
  61%, 100% { opacity: 1; }
}
@keyframes gtm-fingerPulse {
  0%, 100% { transform: scale(1); opacity: 0.95; }
  50% { transform: scale(0.85); opacity: 0.6; }
}
@keyframes gtm-fingerMove {
  0%, 30% { transform: translate(0, 0); }
  31%, 45% { transform: translate(-10px, -42px); }
  46%, 60% { transform: translate(-10px, -42px); }
  61%, 100% { transform: translate(-10px, -42px); opacity: 0; }
}
@keyframes gtm-iconPop {
  0%, 60% { transform: scale(0); opacity: 0; }
  70% { transform: scale(1.2); opacity: 1; }
  80%, 100% { transform: scale(1); opacity: 1; }
}
@keyframes gtm-ringPulse {
  0%, 100% { r: 18; opacity: 0; }
  50% { r: 26; opacity: 0.4; }
}
`;

export default function SafariInstallTutorial({ className = "" }) {
  return (
    <div className={`relative mx-auto ${className}`} style={{ width: 168, height: 240 }} aria-hidden="true">
      <style>{STYLE}</style>
      <svg viewBox="0 0 168 240" width="168" height="240" xmlns="http://www.w3.org/2000/svg">
        {/* iPhone body */}
        <rect x="6" y="6" width="156" height="228" rx="22" fill="#0F172A" />
        {/* Inner screen */}
        <rect x="11" y="11" width="146" height="218" rx="18" fill="#F8FAFC" />
        {/* Dynamic Island */}
        <rect x="60" y="16" width="48" height="11" rx="5.5" fill="#0F172A" />

        {/* ---- STEP 1: Safari with Share button highlighted ---- */}
        <g style={{ animation: "gtm-fadeStep 8s infinite" }}>
          {/* page content area */}
          <rect x="11" y="32" width="146" height="170" fill="#0E4F56" />
          <rect x="11" y="32" width="146" height="170" fill="url(#gtmGrad)" />
          {/* getamano text inside browser */}
          <text x="84" y="105" textAnchor="middle" fill="white" fontSize="11" fontFamily="Arial, sans-serif" fontWeight="700">getamano</text>
          <text x="84" y="121" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="6" fontFamily="Arial, sans-serif">Latino, at your hand.</text>
          <rect x="36" y="135" width="96" height="14" rx="7" fill="#FF6B2C" />
          <text x="84" y="145" textAnchor="middle" fill="white" fontSize="6.5" fontFamily="Arial, sans-serif" fontWeight="700">Buscar</text>
          {/* Bottom Safari toolbar */}
          <rect x="11" y="202" width="146" height="27" fill="#F1F5F9" />
          <rect x="11" y="202" width="146" height="0.5" fill="#CBD5E1" />
          {/* Back arrow */}
          <path d="M 28 215 l -5 0 m 2.5 -3 l -2.5 3 l 2.5 3" stroke="#94A3B8" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          {/* Forward arrow */}
          <path d="M 44 215 l 5 0 m -2.5 -3 l 2.5 3 l -2.5 3" stroke="#94A3B8" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          {/* Share icon highlighted */}
          <g transform="translate(84, 215)">
            <circle r="22" fill="#FF6B2C" opacity="0">
              <animate attributeName="r" values="14;22;14" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.35;0" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <rect x="-5" y="-2" width="10" height="9" rx="1.2" fill="none" stroke="#025F67" strokeWidth="1.4" />
            <path d="M 0 -7 l 0 7 m -2.5 -4.5 l 2.5 -2.5 l 2.5 2.5" stroke="#025F67" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {/* Tabs */}
          <rect x="111" y="210" width="12" height="10" rx="1.5" fill="none" stroke="#94A3B8" strokeWidth="1.2" />
          {/* Address bar */}
          <rect x="20" y="186" width="128" height="10" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="0.7" />
          <text x="84" y="193" textAnchor="middle" fill="#64748B" fontSize="5" fontFamily="Arial, sans-serif">getamano.us</text>

          {/* Ghost finger pointing at Share */}
          <g transform="translate(84, 215)" style={{ animation: "gtm-fingerPulse 1.4s infinite ease-in-out", transformOrigin: "center" }}>
            <circle r="14" fill="white" stroke="#FF6B2C" strokeWidth="2" opacity="0.95" />
            <circle r="6" fill="#FF6B2C" />
          </g>
        </g>

        {/* ---- STEP 2: Share sheet with "Add to Home Screen" highlighted ---- */}
        <g style={{ animation: "gtm-fadeStep2 8s infinite" }}>
          <rect x="11" y="32" width="146" height="197" fill="#475569" opacity="0.5" />
          {/* Share sheet card */}
          <rect x="14" y="120" width="140" height="106" rx="10" fill="white" />
          {/* Drag handle */}
          <rect x="78" y="125" width="12" height="2" rx="1" fill="#CBD5E1" />
          {/* Site row */}
          <rect x="20" y="133" width="128" height="20" rx="4" fill="#F1F5F9" />
          <rect x="24" y="138" width="10" height="10" rx="2" fill="#025F67" />
          <text x="38" y="146" fill="#0F172A" fontSize="5.5" fontFamily="Arial, sans-serif" fontWeight="600">getamano.us</text>
          {/* List items */}
          <rect x="20" y="158" width="128" height="14" fill="white" />
          <text x="24" y="167" fill="#0F172A" fontSize="5.5" fontFamily="Arial, sans-serif">Copy</text>
          <rect x="20" y="172" width="128" height="0.4" fill="#E2E8F0" />
          <rect x="20" y="173" width="128" height="14" fill="white" />
          <text x="24" y="182" fill="#0F172A" fontSize="5.5" fontFamily="Arial, sans-serif">Add Bookmark</text>
          <rect x="20" y="187" width="128" height="0.4" fill="#E2E8F0" />
          {/* Highlighted "Add to Home Screen" */}
          <rect x="20" y="188" width="128" height="14" fill="#FFF7ED" stroke="#FF6B2C" strokeWidth="0.8" rx="2" />
          <text x="24" y="197" fill="#0F172A" fontSize="5.5" fontFamily="Arial, sans-serif" fontWeight="700">Add to Home Screen</text>
          <rect x="138" y="192" width="6" height="6" rx="1.2" fill="none" stroke="#FF6B2C" strokeWidth="1" />
          <line x1="141" y1="192" x2="141" y2="198" stroke="#FF6B2C" strokeWidth="1" />
          <line x1="138" y1="195" x2="144" y2="195" stroke="#FF6B2C" strokeWidth="1" />
          {/* Cancel */}
          <rect x="20" y="205" width="128" height="16" rx="4" fill="#F1F5F9" />
          <text x="84" y="215" textAnchor="middle" fill="#0F172A" fontSize="6" fontFamily="Arial, sans-serif" fontWeight="600">Cancel</text>

          {/* Ghost finger animating from Share button → "Add to Home Screen" */}
          <g style={{ animation: "gtm-fingerMove 8s infinite ease-in-out" }}>
            <g transform="translate(84, 237)" style={{ animation: "gtm-fingerPulse 1.4s infinite ease-in-out", transformOrigin: "center" }}>
              <circle r="11" fill="white" stroke="#FF6B2C" strokeWidth="2" opacity="0.95" />
              <circle r="5" fill="#FF6B2C" />
            </g>
          </g>
        </g>

        {/* ---- STEP 3: Home screen with getamano icon installed ---- */}
        <g style={{ animation: "gtm-fadeStep3 8s infinite" }}>
          <defs>
            <linearGradient id="gtmGradHome" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FB923C" />
              <stop offset="50%" stopColor="#F97316" />
              <stop offset="100%" stopColor="#EA580C" />
            </linearGradient>
          </defs>
          <rect x="11" y="32" width="146" height="197" fill="url(#gtmGradHome)" />
          {/* Faded grid of generic apps */}
          {[0, 1, 2, 3].map((row) => (
            [0, 1, 2, 3].map((col) => {
              const x = 22 + col * 32;
              const y = 50 + row * 36;
              const isGetamano = row === 1 && col === 1;
              if (isGetamano) {
                return (
                  <g key={`${row}-${col}`} style={{ animation: "gtm-iconPop 8s infinite ease-out", transformOrigin: `${x + 11}px ${y + 11}px` }}>
                    {/* Soft glow halo */}
                    <rect x={x - 4} y={y - 4} width="30" height="30" rx="9" fill="white" opacity="0.25" />
                    <rect x={x} y={y} width="22" height="22" rx="6" fill="#025F67" stroke="white" strokeWidth="1.2" />
                    <text x={x + 11} y={y + 15} textAnchor="middle" fill="white" fontSize="11" fontFamily="Arial, sans-serif" fontWeight="800">g</text>
                    <text x={x + 11} y={y + 32} textAnchor="middle" fill="white" fontSize="4.5" fontFamily="Arial, sans-serif" fontWeight="600">getamano</text>
                    {/* Sparkle */}
                    <circle cx={x + 22} cy={y - 1} r="0" fill="#FFD700">
                      <animate attributeName="r" values="0;3.5;0" dur="0.7s" begin="5.0s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              }
              return (
                <g key={`${row}-${col}`} opacity="0.35">
                  <rect x={x} y={y} width="22" height="22" rx="6" fill="white" />
                </g>
              );
            })
          ))}
          {/* Dock */}
          <rect x="20" y="200" width="128" height="22" rx="11" fill="rgba(255,255,255,0.18)" />
        </g>

        <defs>
          <linearGradient id="gtmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E4F56" />
            <stop offset="100%" stopColor="#025F67" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
