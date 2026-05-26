import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { I18nProvider } from "./contexts/I18nContext";
import { PwaInstallProvider } from "./contexts/PwaInstallContext";
import { Toaster } from "sonner";
import { useEffect, lazy, Suspense } from "react";
import AnalyticsTracker from "./components/AnalyticsTracker";
import InstallPrompt from "./components/InstallPrompt";
import InstallAppModal from "./components/InstallAppModal";
import BottomNav from "./components/BottomNav";
import SmartActionHub from "./components/SmartActionHub";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import { registerServiceWorker } from "./lib/pwa";
import { trackIOSFirstLaunchOnce } from "./lib/deviceDetection";

// Section 58 — Lightweight chunk-loading fallback (gradient dots)
const ChunkFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
    <div className="flex items-center gap-3 text-slate-400">
      <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  </div>
);

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
import ComunidadPage from "./pages/ComunidadPage";
import DashboardRouter from "./pages/DashboardRouter";
import Messages from "./pages/Messages";
import UserProfile from "./pages/UserProfile";
import ServiceRequests from "./pages/ServiceRequests";
import Install from "./pages/Install";
import CategoryHub from "./pages/CategoryHub";
import VerifyEmail from "./pages/VerifyEmail";
import EmpleosPage from "./pages/EmpleosPage";
const SavedECardsPage = lazy(() => import("./pages/SavedECardsPage"));
const BannerGalleryPage = lazy(() => import("./pages/BannerGalleryPage"));
import NotFoundPage from "./pages/NotFoundPage";
const RankingPage = lazy(() => import("./pages/RankingPage"));
import ComunidadLayout from "./components/ComunidadLayout";
import ComunidadExplorar from "./pages/ComunidadExplorar";
import QuickActionsFAB from "./components/QuickActionsFAB";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
const AdminOpsPage = lazy(() => import("./pages/AdminOpsPage"));

// Admin Zone 4 — all code-split (rarely on critical path)
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminCEO = lazy(() => import("./pages/admin/AdminCEO"));
const AdminQuizFunnel = lazy(() => import("./pages/admin/AdminQuizFunnel"));
const AdminLeadsInbox = lazy(() => import("./pages/admin/AdminLeadsInbox"));
import SplashScreen from "./components/SplashScreen";
const AdminPricingIntelligence = lazy(() => import("./pages/admin/AdminPricingIntelligence"));
const AdminQueue = lazy(() => import("./pages/admin/AdminQueue"));
const AdminProviders = lazy(() => import("./pages/admin/AdminProviders"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminCatalog = lazy(() => import("./pages/admin/AdminCatalog"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit"));

// Legal pages — code-split (low-traffic, large content)
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const ReviewsPolicy = lazy(() => import("./pages/legal/ReviewsPolicy"));
const Cookies = lazy(() => import("./pages/legal/Cookies"));

// SEO hub pages — code-split (mostly bot-traffic)
const SeoServicesIndex = lazy(() => import("./pages/seo/SeoServicesIndex"));
const SeoCitiesIndex = lazy(() => import("./pages/seo/SeoCitiesIndex"));
const SeoCityDetail = lazy(() => import("./pages/seo/SeoCityDetail"));
const SeoCategoryDetail = lazy(() => import("./pages/seo/SeoCategoryDetail"));
const SeoPage = lazy(() => import("./pages/seo/SeoPage"));

// Admin: bidirectional reports
const AdminReportsBidirectional = lazy(() => import("./pages/admin/AdminReportsBidirectional"));

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Suspense fallback={<ChunkFallback />}>
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

      {/* Section 30 — Gigs / Chambas board (public + auth-aware) */}
      <Route path="/empleos" element={<EmpleosPage />} />
      <Route path="/gigs" element={<EmpleosPage />} />

      {/* Section 35 — Public monthly leaderboard */}
      <Route path="/ranking" element={<RankingPage />} />
      <Route path="/leaderboard" element={<RankingPage />} />

      <Route path="/mis-guardadas" element={<SavedECardsPage />} />
      <Route path="/my-saved" element={<SavedECardsPage />} />

      <Route path="/galeria-banners" element={<BannerGalleryPage />} />
      <Route path="/banner-gallery" element={<BannerGalleryPage />} />

      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register" element={<Register />} />
      <Route path="/registro" element={<Register />} />

      {/* Zone 2: Client Experience */}
      <Route path="/search" element={<Search />} />
      <Route path="/buscar" element={<Search />} />
      <Route path="/proveedor/:slug" element={<ProviderECard />} />
      <Route path="/provider/:slug" element={<ProviderECard />} />
      <Route path="/p/:slug" element={<ProviderECard />} />
      {/* Legacy alias: /services/{slug} used to point to the eCard. We keep it
          mounted last after the SEO hubs so the more-specific category match
          wins, and the eCard is still reachable via /provider/{slug}. */}
      <Route path="/wall" element={<Community />} />

      {/* Section 39 — Persistent /comunidad layout with sticky tab bar.
          The wrapper ComunidadLayout mounts once and the active sub-route
          renders into its <Outlet />. Window scroll position is remembered
          per sub-path so swapping tabs feels app-native. */}
      <Route path="/comunidad" element={<ComunidadLayout />}>
        <Route index element={<ComunidadPage embedded />} />
        <Route path="explorar" element={<ComunidadExplorar />} />
        <Route path="chambas" element={<EmpleosPage embedded />} />
        <Route path="ranking" element={<RankingPage embedded />} />
        <Route path="wall-of-fame" element={<Community embedded />} />
      </Route>
      <Route path="/community" element={<ComunidadLayout />}>
        <Route index element={<ComunidadPage embedded />} />
        <Route path="explorar" element={<ComunidadExplorar />} />
        <Route path="chambas" element={<EmpleosPage embedded />} />
        <Route path="ranking" element={<RankingPage embedded />} />
        <Route path="wall-of-fame" element={<Community embedded />} />
      </Route>

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
      <Route path="/admin/ops" element={<AdminOpsPage />} />
      <Route path="/dashboard/admin/ops" element={<AdminOpsPage />} />
      <Route path="/admin/ceo" element={<AdminCEO />} />
      <Route path="/admin/quiz-funnel" element={<AdminQuizFunnel />} />
      <Route path="/admin/leads" element={<AdminLeadsInbox />} />
      <Route path="/dashboard/admin/leads" element={<AdminLeadsInbox />} />
      <Route path="/admin/pricing" element={<AdminPricingIntelligence />} />
      <Route path="/admin/queue" element={<AdminQueue />} />
      <Route path="/admin/providers" element={<AdminProviders />} />
      <Route path="/admin/reviews" element={<AdminReviews />} />
      <Route path="/admin/reportes" element={<AdminReportsBidirectional />} />
      <Route path="/admin/catalog" element={<AdminCatalog />} />
      <Route path="/admin/audit" element={<AdminAudit />} />
      {/* FIX-14 audit may22 — legacy /dashboard/admin/* aliases so old bookmarks
          and inbound links don't 404 on the founder's CEO panel. */}
      <Route path="/dashboard/admin" element={<AdminOverview />} />
      <Route path="/dashboard/admin/ceo" element={<AdminCEO />} />
      <Route path="/dashboard/admin/quiz-funnel" element={<AdminQuizFunnel />} />
      <Route path="/dashboard/admin/pricing" element={<AdminPricingIntelligence />} />
      <Route path="/dashboard/admin/queue" element={<AdminQueue />} />
      <Route path="/dashboard/admin/providers" element={<AdminProviders />} />
      <Route path="/dashboard/admin/reviews" element={<AdminReviews />} />
      <Route path="/dashboard/admin/reportes" element={<AdminReportsBidirectional />} />
      <Route path="/dashboard/admin/catalog" element={<AdminCatalog />} />
      <Route path="/dashboard/admin/audit" element={<AdminAudit />} />

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
      {/* English canonical aliases for SEO i18n — same components, hreflang annotated */}
      <Route path="/services" element={<SeoServicesIndex />} />
      <Route path="/services/:categorySlug" element={<SeoCategoryDetail />} />
      <Route path="/services/:categorySlug/:citySlug" element={<SeoPage />} />
      <Route path="/cities" element={<SeoCitiesIndex />} />
      <Route path="/cities/:citySlug" element={<SeoCityDetail />} />

      {/* Section 59 — Elegant 404 catch-all (MUST be last route). */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
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
              <SplashScreen />
              <Toaster position="top-right" richColors />
              <AnalyticsTracker />
              <InstallPrompt />
              <InstallAppModal />
              <RouteErrorBoundary>
                <AppRouter />
              </RouteErrorBoundary>
              <BottomNav />
              <QuickActionsFAB />
              <SmartActionHub />
            </BrowserRouter>
          </PwaInstallProvider>
        </AuthProvider>
      </I18nProvider>
    </div>
  );
}

export default App;
