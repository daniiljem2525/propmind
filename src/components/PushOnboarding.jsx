import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { getPushState, enablePush } from "@/lib/push";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

// Диалог включения push после входа. Системный запрос разрешения
// платформы (iOS/Chrome) показывают только в ответ на касание — поэтому
// «автоматически» это работает так: один диалог после входа, кнопка
// «Включить» является жестом и сразу открывает системное разрешение.
// Показывается один раз на устройство; флаг — в localStorage.
const ASK_KEY = "arendora:pushAsked";

export default function PushOnboarding() {
  const { t } = useLang();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (localStorage.getItem(ASK_KEY)) return;
        // На iOS push доставляется только в установленном приложении —
        // в обычной вкладке Safari не спрашиваем
        const standalone =
          window.matchMedia?.("(display-mode: standalone)").matches ||
          window.navigator.standalone === true;
        const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (iOS && !standalone) return;
        const state = await getPushState();
        if (!alive) return;
        if (state.state === "default") setOpen(true);
        else if (state.state === "blocked" || state.state === "unsupported") {
          localStorage.setItem(ASK_KEY, "1");
        }
        // state "enabled" — уже включено, ничего не делаем
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await enablePush();
      localStorage.setItem(ASK_KEY, "1");
      setOpen(false);
      toast.success(t("push.enabledToast"));
    } catch (e) {
      if (e?.message === "PERMISSION_DENIED") {
        localStorage.setItem(ASK_KEY, "1");
        setOpen(false);
        toast.error(t("push.blockedToast"));
      } else {
        // не закрываем диалог — можно нажать снова
        toast.error(e?.message ? `${t("errors.generic")} (${e.message})` : t("errors.generic"));
      }
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    localStorage.setItem(ASK_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={later} title={t("push.onboardingTitle")} size="sm">
      <div className="space-y-4">
        <div className="flex justify-center">
          <span className="brand-gradient flex h-12 w-12 items-center justify-center rounded-xl">
            <BellRing className="h-6 w-6 text-white" />
          </span>
        </div>
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          {t("push.onboardingText")}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={later} disabled={busy}>
            {t("push.onboardingLater")}
          </Button>
          <Button className="flex-1" onClick={enable} loading={busy}>
            {t("push.onboardingEnable")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
