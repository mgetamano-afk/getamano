import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { Mail, MapPin } from "lucide-react";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="text-slate-300 mt-24" style={{ backgroundColor: "#063154" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center p-1.5" style={{ backgroundColor: "#F7F6F2" }}>
              <img src="/getamano-logo-mark.png" alt="" className="w-full h-full object-contain" />
            </div>
            <span className="font-display font-bold text-2xl text-white">get<span style={{ color: "#2F9D94" }}>amano</span></span>
          </div>
          <p className="text-slate-400 text-sm max-w-md leading-relaxed">{t("footer.tagline")}</p>
          <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> USA</span>
            <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> hola@getamano.us</span>
          </div>
        </div>
        <div>
          <h4 className="font-display font-semibold text-white mb-3">Plataforma</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/search" className="hover:text-white transition" data-testid="footer-explore">{t("nav.explore")}</Link></li>
            <li><Link to="/servicios" className="hover:text-white transition" data-testid="footer-services">Todos los servicios</Link></li>
            <li><Link to="/ciudades" className="hover:text-white transition" data-testid="footer-cities">Ciudades</Link></li>
            <li><Link to="/plans" className="hover:text-white transition" data-testid="footer-plans">{t("nav.plans")}</Link></li>
            <li><Link to="/register?intent=provider" className="hover:text-white transition" data-testid="footer-providers">{t("nav.providers")}</Link></li>
            <li><Link to="/instalar" className="hover:text-white transition inline-flex items-center gap-1" data-testid="footer-install"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" /> Descarga la app</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-semibold text-white mb-3">Legal</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/terminos" className="hover:text-white transition" data-testid="footer-link-terms">Términos y Condiciones</Link></li>
            <li><Link to="/privacidad" className="hover:text-white transition" data-testid="footer-link-privacy">Política de Privacidad</Link></li>
            <li><Link to="/politica-resenas" className="hover:text-white transition" data-testid="footer-link-reviews">Política de Reseñas</Link></li>
            <li><Link to="/cookies" className="hover:text-white transition" data-testid="footer-link-cookies">Política de Cookies</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        {t("footer.legal")}
      </div>
    </footer>
  );
}
