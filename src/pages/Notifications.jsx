import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { useCollection } from "@/hooks/useCollection";
import { NotificationEntity } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { NOTIFICATION_TYPE_CONFIG } from "@/lib/config/statuses";
import { cn, formatDate } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function Notifications() {
  const { t, lang } = useLang();
  const [confirmAll, setConfirmAll] = useState(false);
  const navigate = useNavigate();
  const { data: notifications } = useCollection(NotificationEntity);
  const unread = notifications.filter((n) => !n.is_read).length;

  const markRead = async (n) => {
    if (!n.is_read) await NotificationEntity.update(n.id, { is_read: true });
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    for (const n of notifications.filter((x) => !x.is_read)) {
      await NotificationEntity.update(n.id, { is_read: true });
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("notifications.title")}
        subtitle={unread > 0 ? t("notifications.unread").replace("{n}", unread) : t("notifications.subtitle")}
        actions={
          unread > 0 && (
            <Button variant="outline" onClick={() => setConfirmAll(true)}>
              <CheckCheck className="h-4 w-4" />
              {t("notifications.markAllRead")}
            </Button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("notifications.empty")}
          action={
            <Button asChild variant="outline">
              <Link to="/app">{t("notFound.back")}</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {notifications.map((n) => {
              const conf = NOTIFICATION_TYPE_CONFIG[n.type] || NOTIFICATION_TYPE_CONFIG.general;
              const Icon = conf.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={cn(
                    "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white", conf.tile)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{n.title}</span>
                      {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground/70">
                      {formatDate(n.created_date, lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => {
          setConfirmAll(false);
          markAll();
        }}
        title={t("notifications.confirmMarkAllTitle")}
        description={t("notifications.confirmMarkAllDesc")}
        confirmLabel={t("notifications.markAllRead")}
      />
    </div>
  );
}
