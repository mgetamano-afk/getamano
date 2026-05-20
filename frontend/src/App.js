import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { I18nProvider } from "./contexts/I18nContext";
import { Toaster } from "sonner";

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
import DashboardRouter from "./pages/DashboardRouter";
import Messages from "./pages/Messages";
import UserProfile from "./pages/UserProfile";
import ServiceRequests from "./pages/ServiceRequests";

// Admin Zone 4
import AdminOverview from "./pages/admin/AdminOverview";
import AdminQueue from "./pages/admin/AdminQueue";
import AdminProviders from "./pages/admin/AdminProviders";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminCatalog from "./pages/admin/AdminCatalog";
import AdminAudit from "./pages/admin/AdminAudit";

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

      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/registro" element={<Register />} />

      {/* Zone 2: Client Experience */}
      <Route path="/search" element={<Search />} />
      <Route path="/buscar" element={<Search />} />
      <Route path="/services/:slug" element={<ProviderECard />} />
      <Route path="/proveedor/:slug" element={<ProviderECard />} />

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
      <Route path="/admin/queue" element={<AdminQueue />} />
      <Route path="/admin/providers" element={<AdminProviders />} />
      <Route path="/admin/reviews" element={<AdminReviews />} />
      <Route path="/admin/catalog" element={<AdminCatalog />} />
      <Route path="/admin/audit" element={<AdminAudit />} />
      <Route path="/dashboard/admin" element={<AdminOverview />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Toaster position="top-right" richColors />
            <AppRouter />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </div>
  );
}

export default App;
