import { useState, useCallback } from "react";
import { isDemoMode } from "@/lib/demoMode";
import { clearDemoData } from "@/lib/demo";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n/LangContext";

// Гейт добавления в демо-режиме: демо — витрина, а не песочница.
// Любое «добавить» сначала предлагает перейти в реальный режим;
// по подтверждению демо-данные удаляются и действие продолжается.
export function useDemoExitGate() {
  const { t } = useLang();
  const [pending, setPending] = useState(null); // действие, ждущее выхода из демо
  const [busy, setBusy] = useState(false);

  // В реальном режиме действие выполняется сразу
  const guarded = useCallback((action) => {
    if (!isDemoMode()) {
      action();
      return;
    }
    setPending(() => action);
  }, []);

  const confirm = async () => {
    setBusy(true);
    try {
      await clearDemoData(); // удалит демо и выключит демо-режим
    } finally {
      setBusy(false);
      const action = pending;
      setPending(null);
      if (action) action();
    }
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onClose={() => setPending(null)}
      onConfirm={confirm}
      loading={busy}
      title={t("demo.exitTitle")}
      description={t("demo.exitDesc")}
      confirmLabel={t("demo.exitConfirm")}
    />
  );

  return { guarded, dialog };
}
