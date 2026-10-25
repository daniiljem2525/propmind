import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { cn } from "@/lib/utils";
import { syncOverduePayments } from "@/lib/services";
import PushOnboarding from "@/components/PushOnboarding";

const KEY = "arendora:sidebar";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // Автопросрочка платежей при входе в приложение
  useEffect(() => {
    syncOverduePayments();
  }, []);

  return (
    <div className="min-h-screen">
      <PushOnboarding />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={cn("flex min-h-screen flex-col transition-all duration-200", collapsed ? "lg:pl-[60px]" : "lg:pl-64")}>
        <Header onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Смена страницы мгновенная: только мягкое появление новой.
              Анимация выхода (AnimatePresence mode="wait") давала паузу,
              схлопывание контента и «прыжок» раскладки. */}
          <div key={pathname} className="animate-fade-in mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
