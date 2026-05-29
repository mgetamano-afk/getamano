import BrandMark from "./BrandMark";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { Mail, MapPin, Instagram, Facebook, Music2 } from "lucide-react";

const SOCIAL_LINKS = [
  // Section 28 — placeholder URLs; update when accounts go live.
  { name: "Instagram", href: "https://instagram.com/getamano", Icon: Instagram, testid: "footer-social-instagram" },
  { name: "Facebook",  href: "https://facebook.com/getamano",  Icon: Facebook,  testid: "footer-social-facebook" },
  { name: "TikTok",    href: "https://tiktok.com/@getamano",   Icon: Music2,    testid: "footer-social-tiktok" },
];

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="text-slate-300 mt-24" style={{ backgroundColor: "#03045E" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center p-1.5" style={{ backgroundColor: "#F8FCFD" }}>
              <BrandMark size="md" className="w-full h-full" alt="" />
            </div>
            <span className="font-display font-bold text-2xl text-white">get<span style={{ color: "#0077B6" }}>amano</span></span>
          </div>
          <p className="text-slate-400 text-sm max-w-md leading-relaxed">{t("footer.tagline")}</p>
          {/* Section 67 — dual-audience pride badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-slate-700 text-[11px] font-semibold text-slate-300" data-testid="footer-latino-built-badge">
            🫂 <span>Latino-built · America-wide</span>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> USA</span>
            <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> hola@getamano.us</span>
          </div>

          {/* Section 28 — Social icons row */}
          <div className="mt-5 flex items-center gap-3" data-testid="footer-social-row">
            <span className="text-xs uppercase font-semibold tracking-wider text-slate-500">{t("footer.follow_us")}</span>
            {SOCIAL_LINKS.map(({ name, href, Icon, testid }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={name}
                className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-400 hover:text-white transition border border-slate-700 hover:border-teal-500 hover:bg-teal-500/10"
                data-testid={testid}
              >
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-display font-semibold text-white mb-3">{t("footer.platform")}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/search" className="hover:text-white transition" data-testid="footer-explore">{t("nav.explore")}</Link></li>
            <li><Link to="/servicios" className="hover:text-white transition" data-testid="footer-services">{t("footer.all_services")}</Link></li>
            <li><Link to="/empleos" className="hover:text-white transition" data-testid="footer-empleos">{t("footer.chambas")}</Link></li>
            <li><Link to="/ranking" className="hover:text-white transition" data-testid="footer-ranking">{t("footer.ranking_month")}</Link></li>
            <li><Link to="/ciudades" className="hover:text-white transition" data-testid="footer-cities">{t("footer.cities")}</Link></li>
            <li><Link to="/plans" className="hover:text-white transition" data-testid="footer-plans">{t("nav.plans")}</Link></li>
            <li><Link to="/register?role=provider" className="hover:text-white transition" data-testid="footer-providers">{t("nav.providers")}</Link></li>
            <li><Link to="/instalar" className="hover:text-white transition inline-flex items-center gap-1" data-testid="footer-install"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> {t("footer.download_app")}</Link></li>
            <li><Link to="/nosotros" className="hover:text-white transition" data-testid="footer-about">{t("footer.about")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-semibold text-white mb-3">{t("footer.legal_section")}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/terminos" className="hover:text-white transition" data-testid="footer-link-terms">{t("footer.terms")}</Link></li>
            <li><Link to="/privacidad" className="hover:text-white transition" data-testid="footer-link-privacy">{t("footer.privacy")}</Link></li>
            <li><Link to="/politica-resenas" className="hover:text-white transition" data-testid="footer-link-reviews">{t("footer.reviews_policy")}</Link></li>
            <li><Link to="/cookies" className="hover:text-white transition" data-testid="footer-link-cookies">{t("footer.cookies")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        {t("footer.legal")}
      </div>
    </footer>
  );
}
