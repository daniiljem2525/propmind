import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPushState, enablePush, disablePush } from "@/lib/push";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

// Push-уведомления на телефон: подписка через сервис-воркер (Web Push).
// Работает в облаке; на iOS — после установки приложения на экран «Домой».
export default function PushCard() {
  const { t } = useLang();
  const toast = useToast();
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    getPushState()
      .then((s) => setState(s.state))
      .catch(() => setState("unsupported"));

  useEffect(() => {
    refresh();
  }, []);

  const on = () => {
    setBusy(true);
    enablePush()
      .then(() => {
        setState("enabled");
        toast.success(t("push.enabledToast"));
      })
      .catch((e) => {
        console.error("enablePush failed:", e);
        if (e.message === "PERMISSION_DENIED") {
          setState("blocked");
          toast.error(t("push.blockedToast"));
        } else {
          // подробность в тосте — чтобы видно было конкретную причину сбоя
          toast.error(e?.message ? `${t("errors.generic")} (${e.message})` : t("errors.generic"));
        }
      })
      .finally(() => setBusy(false));
  };

  const off = () => {
    setBusy(true);
    disablePush()
      .then(() => {
        setState("default");
        toast.success(t("push.disabledToast"));
      })
      .catch((e) => {
        console.error("disablePush failed:", e);
        toast.error(t("errors.generic"));
      })
      .finally(() => setBusy(false));
  };

  const labels = {
    loading: "…",
    unsupported: t("push.unsupported"),
    blocked: t("push.blocked"),
    default: t("push.off"),
    enabled: t("push.on"),
  };

  return (
    <Card className="max-w-xl">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            {t("push.title")}
          </CardTitle>
          <CardDescription className="mt-1">{t("push.desc")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span
            className={`mr-2 inline-block h-2 w-2 rounded-full ${
              state === "enabled" ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {labels[state] || labels.default}
        </p>
        {state === "enabled" ? (
          <Button size="sm" variant="outline" onClick={off} loading={busy}>
            {t("push.disable")}
          </Button>
        ) : (
          <Button size="sm" onClick={on} loading={busy} disabled={state === "unsupported" || state === "blocked"}>
            {t("push.enable")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
