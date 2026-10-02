import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/authContext";
import ScreenLoader from "@/components/ScreenLoader";

export default function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  // undefined = профиль ещё загружается: не редиректим и не пускаем "без аккаунта"
  if (user === undefined) return <ScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
