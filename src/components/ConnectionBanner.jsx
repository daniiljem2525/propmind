import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

// Индикатор соединения: красный баннер при потере сети,
// зелёное подтверждение при восстановлении
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [reconnected, setReconnected] = useState(false);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      setReconnected(false);
    };
    const onOnline = () => {
      setOffline(false);
      setReconnected(true);
      setTimeout(() => setReconnected(false), 4000);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-[110] -translate-x-1/2 transition-all duration-300",
        offline || reconnected ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-card-hover",
          offline
            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
        )}
      >
        {offline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
        {offline ? "Нет соединения — проверьте интернет" : "Соединение восстановлено"}
      </div>
    </div>
  );
}
