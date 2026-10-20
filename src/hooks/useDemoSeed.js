import { useState } from "react";
import { seedDemoData, clearAllData } from "@/lib/demo";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

export function useDemoSeed() {
  const { t } = useLang();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const run = async ({ reset = false } = {}) => {
    setLoading(true);
    try {
      const res = await seedDemoData({ reset });
      toast.success(res.skipped ? t("demo.already") : `${t("demo.loaded")} · ${t("demo.planUnlocked")}`);
    } catch (e) {
      toast.error(e.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await clearAllData();
      toast.success(t("demo.cleared"));
    } catch (e) {
      toast.error(e.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setClearing(false);
    }
  };

  return { run, clear, loading, clearing };
}
