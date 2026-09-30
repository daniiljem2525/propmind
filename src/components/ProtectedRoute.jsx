import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/authContext";

export default function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  // undefined = профиль ещё загружается: не редиректим и не пускаем "без аккаунта"
  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
