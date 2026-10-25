import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import ConnectionBanner from "@/components/ConnectionBanner";
import CookieBanner from "@/components/CookieBanner";
import { LangProvider } from "@/lib/i18n/LangContext";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth as useAuthSafe } from "@/lib/authContext";

import ProtectedRoute from "@/components/ProtectedRoute";
import GuestRoute from "@/components/GuestRoute";
import AppLayout from "@/components/layout/AppLayout";

import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Agreement from "@/pages/legal/Agreement";
import Consent from "@/pages/legal/Consent";
import Tariffs from "@/pages/legal/Tariffs";
import PaymentsPolicy from "@/pages/legal/Payments";
import UsePolicy from "@/pages/legal/UsePolicy";
import Cookies from "@/pages/legal/Cookies";
import { Blog, BlogPost } from "@/pages/Blog";
import Dashboard from "@/pages/Dashboard";
import TenantPortal from "@/pages/TenantPortal";
import ContractorJobs from "@/pages/ContractorJobs";

// Роль-зависимый главный экран: у жильца и исполнителя — свои порталы
function RoleDashboard() {
  const { user } = useAuthSafe();
  if (user?.role === "contractor") return <ContractorJobs />;
  if (user?.role === "tenant") return <TenantPortal />;
  return <Dashboard />;
}
import Properties from "@/pages/Properties";
import Tenants from "@/pages/Tenants";
import Payments from "@/pages/Payments";
import Maintenance from "@/pages/Maintenance";
import Services from "@/pages/Services";
import Documents from "@/pages/Documents";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Notifications from "@/pages/Notifications";
import NotFound from "@/pages/NotFound";

import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import SocialCallback from "@/pages/auth/SocialCallback";

// Весь код в одном бандле: деплой инлайнит его в index.html, оболочка
// самодостаточна — кэшированная оболочка никогда не ссылается на чанки,
// которых уже нет на сервере (класс ошибок «Importing a module script failed»).
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <LangProvider>
          <ThemeProvider>
            <AuthProvider>
              <Routes>
                {/* Публичный сайт — только для гостей: залогиненных
                    сразу в приложение (иначе после свайпа PWA каждый
                    раз выглядит разлогиненным) */}
                <Route element={<GuestRoute />}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  {/* Возврат из соц-входа (Яндекс/VK/Mail.ru): обмен token_hash на сессию */}
                  <Route path="/auth/social" element={<SocialCallback />} />
                </Route>

                <Route path="/blog" element={<Blog />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/agreement" element={<Agreement />} />
                <Route path="/consent" element={<Consent />} />
                <Route path="/tariffs" element={<Tariffs />} />
                <Route path="/payments" element={<PaymentsPolicy />} />
                <Route path="/usepolicy" element={<UsePolicy />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Приложение */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/app" element={<AppLayout />}>
                    <Route index element={<RoleDashboard />} />
                    <Route path="properties" element={<Properties />} />
                    <Route path="tenants" element={<Tenants />} />
                    <Route path="payments" element={<Payments />} />
                    <Route path="services" element={<Services />} />
                    <Route path="maintenance" element={<Maintenance />} />
                    <Route path="documents" element={<Documents />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="admin" element={<Admin />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Route>

                <Route element={<GuestRoute />}>
                  <Route path="*" element={<Landing />} />
                </Route>
              </Routes>
            </AuthProvider>
            <CookieBanner />
          </ThemeProvider>
        </LangProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
