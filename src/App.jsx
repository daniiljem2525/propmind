import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import ConnectionBanner from "@/components/ConnectionBanner";
import { LangProvider } from "@/lib/i18n/LangContext";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth as useAuthSafe } from "@/lib/authContext";

import ProtectedRoute from "@/components/ProtectedRoute";
import GuestRoute from "@/components/GuestRoute";
import ScreenLoader from "@/components/ScreenLoader";

// Страницы грузим лениво: в первый экран попадает только необходимое,
// остальное докачивается при переходе (чанки кэширует сервис-воркер).
const Landing = lazy(() => import("@/pages/Landing"));
const Blog = lazy(() => import("@/pages/Blog").then((m) => ({ default: m.Blog })));
const BlogPost = lazy(() => import("@/pages/Blog").then((m) => ({ default: m.BlogPost })));
const Login = lazy(() => import("@/pages/auth/Login"));
const Register = lazy(() => import("@/pages/auth/Register"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));

const AppLayout = lazy(() => import("@/components/layout/AppLayout"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const TenantPortal = lazy(() => import("@/pages/TenantPortal"));
const ContractorJobs = lazy(() => import("@/pages/ContractorJobs"));
const Properties = lazy(() => import("@/pages/Properties"));
const Tenants = lazy(() => import("@/pages/Tenants"));
const Payments = lazy(() => import("@/pages/Payments"));
const Maintenance = lazy(() => import("@/pages/Maintenance"));
const Documents = lazy(() => import("@/pages/Documents"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Settings = lazy(() => import("@/pages/Settings"));
const Admin = lazy(() => import("@/pages/Admin"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// Роль-зависимый главный экран: у жильца и исполнителя — свои порталы
function RoleDashboard() {
  const { user } = useAuthSafe();
  if (user?.role === "contractor") return <ContractorJobs />;
  if (user?.role === "tenant") return <TenantPortal />;
  return <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <LangProvider>
          <ThemeProvider>
            <AuthProvider>
              <Suspense fallback={<ScreenLoader />}>
                <Routes>
                  {/* Публичный сайт — только для гостей: залогиненных
                      сразу в приложение (иначе после свайпа PWA каждый
                      раз выглядит разлогиненным) */}
                  <Route element={<GuestRoute />}>
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                  </Route>

                  <Route path="/blog" element={<Blog />} />
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
              </Suspense>
            </AuthProvider>
          </ThemeProvider>
        </LangProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
