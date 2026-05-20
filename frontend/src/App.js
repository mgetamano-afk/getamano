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
import AdminDashboard from "./pages/AdminDashboard";
import Plans from "./pages/Plans";
import DashboardRouter from "./pages/DashboardRouter";
import Messages from "./pages/Messages";
import UserProfile from "./pages/UserProfile";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/search" element={<Search />} />
      <Route path="/services/:slug" element={<ProviderECard />} />
      <Route path="/dashboard" element={<DashboardRouter />} />
      <Route path="/dashboard/provider" element={<ProviderDashboard />} />
      <Route path="/dashboard/client" element={<ClientDashboard />} />
      <Route path="/dashboard/admin" element={<AdminDashboard />} />
      <Route path="/provider/onboarding" element={<ProviderOnboarding />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/profile" element={<UserProfile />} />
      <Route path="/plans" element={<Plans />} />
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
