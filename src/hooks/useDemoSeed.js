import { useState } from "react";
import { seedDemoData } from "@/lib/demo";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

export function useDemoSeed() {
  const { t } = useLang();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await seedDemoData();
      toast.success(res.skipped ? t("demo.already") : t("demo.loaded"));
    } catch (e) {
      toast.error(e.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  return { run, loading };
}
