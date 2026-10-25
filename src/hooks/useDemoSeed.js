import { useState } from "react";
import { seedDemoData, clearAllData, clearDemoData } from "@/lib/demo";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

export function useDemoSeed() {
  const { t } = useLang();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  // «Демо уже показывали»: после первой загрузки/очистки баннер на дашборде
  // больше не предлагаем — пользователь про демо знает.
  const markDemoSeen = () => {
    try {
      localStorage.setItem("arendora:demoSeen", "1");
    } catch {}
  };

  const run = async ({ reset = false } = {}) => {
    setLoading(true);
    try {
      const res = await seedDemoData({ reset });
      markDemoSeen();
      toast.success(res.skipped ? t("demo.already") : `${t("demo.loaded")} · ${t("demo.planUnlocked")}`);
    } catch (e) {
      console.error("demo seed failed:", e);
      toast.error(e.message === "QUOTA_EXCEEDED" ? t("errors.quota") : `${t("errors.generic")} (${e.message || e})`);
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await clearAllData();
      markDemoSeen();
      toast.success(t("demo.cleared"));
    } catch (e) {
      toast.error(e.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setClearing(false);
    }
  };

  // Удаление только демо-слоя: реальные данные владельца остаются
  const clearDemo = async () => {
    setClearing(true);
    try {
      await clearDemoData();
      markDemoSeen();
      toast.success(t("demo.deleted"));
    } catch (e) {
      toast.error(e.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setClearing(false);
    }
  };

  return { run, clear, clearDemo, loading, clearing };
}
