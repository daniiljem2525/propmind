import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/authContext";
import ScreenLoader from "@/components/ScreenLoader";

// Публичные страницы (лендинг, вход, регистрация) — только для гостей.
// Залогиненного сразу отправляем в приложение: PWA после свайпа открывает
// стартовый URL, и пользователь не должен заново «входить», когда сессия
// на самом деле жива (визуально это выглядело как разлогин).
export default function GuestRoute() {
  const { user } = useAuth();
  // undefined = профиль ещё загружается: показываем индикатор,
  // чтобы не мигать лендингом перед переходом в приложение
  if (user === undefined) return <ScreenLoader />;
  if (user) return <Navigate to="/app" replace />;
  return <Outlet />;
}
