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
import { hasAccess } from "@/lib/config/statuses";

import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Agreement from "@/pages/legal/Agreement";
import Consent from "@/pages/legal/Consent";
import Tariffs from "@/pages/legal/Tariffs";
import Details from "@/pages/legal/Details";
import Plan from "@/pages/Plan";
import SupportChat from "@/components/SupportChat";
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

// Роль-гейт страницы: доступ по матрице ROLE_ACCESS (config/statuses.js).
// Сайдбар прячет ссылки, RoleRoute закрывает прямой URL: управляющий и
// бухгалтер попадают на 404 вне своей матрицы, legacy-роли ("user", undefined
// до загрузки) — полный доступ, прежнее поведение сохранено.
function RoleRoute({ page, children }) {
  const { user } = useAuthSafe();
  if (user === undefined) return null;
  if (!hasAccess(user, page)) return <NotFound />;
  return children;
}
import Properties from "@/pages/Properties";
import Tenants from "@/pages/Tenants";
import Payments from "@/pages/Payments";
import Maintenance from "@/pages/Maintenance";
import Inspections from "@/pages/Inspections";
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
import AuthCallback from "@/pages/auth/AuthCallback";

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
                  {/* Ссылка подтверждения почты: автологин — сразу в /app */}
                  <Route path="/auth/confirm" element={<AuthCallback />} />
                </Route>

                <Route path="/blog" element={<Blog />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/agreement" element={<Agreement />} />
                <Route path="/consent" element={<Consent />} />
                <Route path="/tariffs" element={<Tariffs />} />
                <Route path="/details" element={<Details />} />
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
                    <Route path="properties" element={<RoleRoute page="properties"><Properties /></RoleRoute>} />
                    <Route path="tenants" element={<RoleRoute page="tenants"><Tenants /></RoleRoute>} />
                    <Route path="payments" element={<RoleRoute page="payments"><Payments /></RoleRoute>} />
                    <Route path="maintenance" element={<RoleRoute page="maintenance"><Maintenance /></RoleRoute>} />
                    <Route path="inspections" element={<RoleRoute page="inspections"><Inspections /></RoleRoute>} />
                    <Route path="documents" element={<RoleRoute page="documents"><Documents /></RoleRoute>} />
                    <Route path="analytics" element={<RoleRoute page="analytics"><Analytics /></RoleRoute>} />
                    <Route path="plan" element={<RoleRoute page="plan"><Plan /></RoleRoute>} />
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
            <SupportChat />
            </AuthProvider>
            <CookieBanner />
          </ThemeProvider>
        </LangProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
