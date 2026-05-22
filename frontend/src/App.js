import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { I18nProvider } from "./contexts/I18nContext";
import { PwaInstallProvider } from "./contexts/PwaInstallContext";
import { Toaster } from "sonner";
import { useEffect } from "react";
import AnalyticsTracker from "./components/AnalyticsTracker";
import InstallPrompt from "./components/InstallPrompt";
import InstallAppModal from "./components/InstallAppModal";
import BottomNav from "./components/BottomNav";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import { registerServiceWorker } from "./lib/pwa";
import { trackIOSFirstLaunchOnce } from "./lib/deviceDetection";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import Search from "./pages/Search";
import ProviderECard from "./pages/ProviderECard";
import ProviderDashboard from "./pages/ProviderDashboard";
import ProviderOnboarding from "./pages/ProviderOnboarding";
import ClientDashboard from "./pages/ClientDashboard";
import Plans from "./pages/Plans";
import Community from "./pages/Community";
import DashboardRouter from "./pages/DashboardRouter";
import Messages from "./pages/Messages";
import UserProfile from "./pages/UserProfile";
import ServiceRequests from "./pages/ServiceRequests";
import Install from "./pages/Install";
import CategoryHub from "./pages/CategoryHub";
import VerifyEmail from "./pages/VerifyEmail";

// Admin Zone 4
import AdminOverview from "./pages/admin/AdminOverview";
import AdminCEO from "./pages/admin/AdminCEO";
import AdminQuizFunnel from "./pages/admin/AdminQuizFunnel";
import AdminPricingIntelligence from "./pages/admin/AdminPricingIntelligence";
import AdminQueue from "./pages/admin/AdminQueue";
import AdminProviders from "./pages/admin/AdminProviders";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminCatalog from "./pages/admin/AdminCatalog";
import AdminAudit from "./pages/admin/AdminAudit";

// Legal pages
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import ReviewsPolicy from "./pages/legal/ReviewsPolicy";
import Cookies from "./pages/legal/Cookies";

// SEO hub pages
import SeoServicesIndex from "./pages/seo/SeoServicesIndex";
import SeoCitiesIndex from "./pages/seo/SeoCitiesIndex";
import SeoCityDetail from "./pages/seo/SeoCityDetail";
import SeoCategoryDetail from "./pages/seo/SeoCategoryDetail";
import SeoPage from "./pages/seo/SeoPage";

// Admin: bidirectional reports
import AdminReportsBidirectional from "./pages/admin/AdminReportsBidirectional";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      {/* Zone 1: Landing */}
      <Route path="/" element={<Landing />} />

      {/* PWA install landing — share-friendly URL for QR codes / WhatsApp links */}
      <Route path="/instalar" element={<Install />} />
      <Route path="/install" element={<Install />} />

      {/* SEO category hubs — indexed by Google for organic search */}
      <Route path="/categoria/:slug" element={<CategoryHub />} />
      <Route path="/category/:slug" element={<CategoryHub />} />

      {/* Email OTP verification — Section 24 */}
      <Route path="/verificar-correo" element={<VerifyEmail />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/registro" element={<Register />} />

      {/* Zone 2: Client Experience */}
      <Route path="/search" element={<Search />} />
      <Route path="/buscar" element={<Search />} />
      <Route path="/services/:slug" element={<ProviderECard />} />
      <Route path="/proveedor/:slug" element={<ProviderECard />} />
      <Route path="/p/:slug" element={<ProviderECard />} />
      <Route path="/comunidad" element={<Community />} />
      <Route path="/community" element={<Community />} />

      {/* Zone 3: Provider + Client Dashboards */}
      <Route path="/dashboard" element={<DashboardRouter />} />
      <Route path="/dashboard/provider" element={<ProviderDashboard />} />
      <Route path="/dashboard/client" element={<ClientDashboard />} />
      <Route path="/provider/onboarding" element={<ProviderOnboarding />} />
      <Route path="/requests" element={<ServiceRequests />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/profile" element={<UserProfile />} />
      <Route path="/plans" element={<Plans />} />

      {/* Zone 4: Admin (separate dark layout) */}
      <Route path="/admin" element={<AdminOverview />} />
      <Route path="/admin/ceo" element={<AdminCEO />} />
      <Route path="/admin/quiz-funnel" element={<AdminQuizFunnel />} />
      <Route path="/admin/pricing" element={<AdminPricingIntelligence />} />
      <Route path="/admin/queue" element={<AdminQueue />} />
      <Route path="/admin/providers" element={<AdminProviders />} />
      <Route path="/admin/reviews" element={<AdminReviews />} />
      <Route path="/admin/reportes" element={<AdminReportsBidirectional />} />
      <Route path="/admin/catalog" element={<AdminCatalog />} />
      <Route path="/admin/audit" element={<AdminAudit />} />
      <Route path="/dashboard/admin" element={<AdminOverview />} />

      {/* Legal */}
      <Route path="/terminos" element={<Terms />} />
      <Route path="/privacidad" element={<Privacy />} />
      <Route path="/politica-resenas" element={<ReviewsPolicy />} />
      <Route path="/cookies" element={<Cookies />} />

      {/* SEO hub routes */}
      <Route path="/servicios" element={<SeoServicesIndex />} />
      <Route path="/servicios/:categorySlug" element={<SeoCategoryDetail />} />
      <Route path="/servicios/:categorySlug/:citySlug" element={<SeoPage />} />
      <Route path="/ciudades" element={<SeoCitiesIndex />} />
      <Route path="/ciudades/:citySlug" element={<SeoCityDetail />} />
    </Routes>
  );
}

function App() {
  // Register the PWA service worker once at boot. Idempotent — safe to call.
  useEffect(() => { registerServiceWorker(); }, []);
  // iOS has no `appinstalled` event, so we detect the first launch in
  // standalone mode and fire `pwa_installed` exactly once.
  useEffect(() => { trackIOSFirstLaunchOnce(); }, []);

  return (
    <div className="App">
      <I18nProvider>
        <AuthProvider>
          <PwaInstallProvider>
            <BrowserRouter>
              <Toaster position="top-right" richColors />
              <AnalyticsTracker />
              <InstallPrompt />
              <InstallAppModal />
              <RouteErrorBoundary>
                <AppRouter />
              </RouteErrorBoundary>
              <BottomNav />
            </BrowserRouter>
          </PwaInstallProvider>
        </AuthProvider>
      </I18nProvider>
    </div>
  );
}

export default App;
