import { useEffect, useState } from "react";
import { Building2, CalendarClock, Globe, Send, User, Wrench } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { AutomationOrder, Property, RequestComment, RequestEvent } from "@/lib/api/entities";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import {
  CATEGORY_CONFIG,
  REQUEST_EVENT_CONFIG,
  ROLES,
  URGENCY_CONFIG,
  MAINTENANCE_STATUS_CONFIG,
} from "@/lib/config/statuses";

const byDate = (a, b) => (a.created_date || "").localeCompare(b.created_date || "");

// Категория заявки → запрос услуги на Профи.ру (воркер automation/).
const PROFI_SERVICE = {
  plumbing: "сантехник",
  electrical: "электрик",
  appliances: "ремонт бытовой техники",
  furniture: "сборка мебели",
  other: "",
};
const URGENCY_DEADLINE = { emergency: "today", high: "today", medium: "week", low: "anytime" };

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}

// Детали заявки: характеристики, таймлайн событий и обсуждение.
// Общий для владельца, жильца и исполнителя — состав виден по RLS/фильтрам.
export default function RequestDetails({ request, open, onClose }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingProfi, setSendingProfi] = useState(false);

  useEffect(() => {
    if (!open || !request) return undefined;
    let alive = true;
    Promise.all([RequestEvent.list(), RequestComment.list()])
      .then(([evs, cmts]) => {
        if (!alive) return;
        const mine = (rows) => rows.filter((x) => x.request_id === request.id);
        setEvents(mine(evs).sort(byDate));
        setComments(mine(cmts).sort(byDate));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, request]);

  if (!request) return null;

  const fmtDateTime = (iso) =>
    iso
      ? formatDate(iso, lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;
  const categoryCfg = CATEGORY_CONFIG[request.category] || CATEGORY_CONFIG.other;

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await RequestComment.create({
        request_id: request.id,
        author_id: user?.id,
        author_name: user?.full_name || "",
        author_role: user?.role || "owner",
        body,
      });
      const all = await RequestComment.list();
      setComments(all.filter((x) => x.request_id === request.id).sort(byDate));
      setDraft("");
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSending(false);
    }
  };

  const sendToProfi = async () => {
    setSendingProfi(true);
    try {
      // адрес объекта сразу в очередь — воркер подставит его на шаге «Улица и номер дома»
      let address = null;
      if (request.property_id) {
        const prop = await Property.getById(request.property_id).catch(() => null);
        address = prop?.address || null;
      }
      await AutomationOrder.create({
        request_id: request.id,
        platform: "profi",
        service_query: PROFI_SERVICE[request.category] || request.title || "мастер на час",
        details: [request.title, request.description].filter(Boolean).join(". ").slice(0, 900),
        address,
        budget: request.estimate_cost ?? null,
        deadline: URGENCY_DEADLINE[request.urgency] || "week",
      });
      toast.success(
        lang === "ru"
          ? "Заявка в очереди: воркер создаст заказ на Профи.ру"
          : "Queued: the worker will place the order on Profi.ru",
      );
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSendingProfi(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={request.title || t("req.untitled")}
      size="lg"
      footer={
        <div className="flex items-center gap-2">
          {user?.role === "owner" &&
            !["done", "closed", "cancelled"].includes(request.status) && (
              <Button
                variant="outline"
                onClick={sendToProfi}
                loading={sendingProfi}
                title="Создать заказ на Профи.ру через воркер"
              >
                <Globe className="h-4 w-4" />
                {lang === "ru" ? "Отправить на Профи" : "Send to Profi"}
              </Button>
            )}
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={request.status} />
          <StatusBadge config={URGENCY_CONFIG} value={request.urgency} />
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <categoryCfg.icon className="h-3 w-3" />
            {lang === "ru" ? categoryCfg.label_ru : categoryCfg.label_en}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{request.description}</p>

        {request.photo_url && (
          <img
            src={request.photo_url}
            alt=""
            className="max-h-48 w-full rounded-md object-cover"
            onError={(e) => e.currentTarget.remove()}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow icon={Building2} label={t("req.propertyField")} value={request.property_name} />
          <InfoRow icon={User} label={t("req.tenantField")} value={request.tenant_name} />
          <InfoRow icon={Wrench} label={t("req.contractorField")} value={request.contractor_name} />
          <InfoRow icon={CalendarClock} label={t("req.scheduled")} value={fmtDateTime(request.scheduled_at)} />
          <InfoRow
            icon={Wrench}
            label={t("req.estimate")}
            value={request.estimate_cost != null ? formatMoney(request.estimate_cost, "RUB", lang) : null}
          />
          <InfoRow
            icon={Wrench}
            label={t("req.cost")}
            value={request.work_cost != null ? formatMoney(request.work_cost, "RUB", lang) : null}
          />
        </div>

        {request.work_notes && (
          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">{t("jobs.workNotes")}</p>
            <p>{request.work_notes}</p>
          </div>
        )}
        {request.cancel_reason && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
            <p className="text-xs opacity-80">{t("req.cancelReason")}</p>
            <p>{request.cancel_reason}</p>
          </div>
        )}
        {request.work_photo_url && (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">{t("jobs.workPhoto")}</p>
            <img
              src={request.work_photo_url}
              alt=""
              className="max-h-48 w-full rounded-md object-cover"
              onError={(e) => e.currentTarget.remove()}
            />
          </div>
        )}

        {/* Таймлайн */}
        <div>
          <h4 className="mb-3 text-sm font-semibold">{t("req.timeline")}</h4>
          <div className="space-y-3">
            {events.map((e) => {
              const cfg = REQUEST_EVENT_CONFIG[e.event] || REQUEST_EVENT_CONFIG.created;
              const Icon = cfg.icon;
              return (
                <div key={e.id} className="flex gap-3">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      cfg.chip
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 border-b pb-2.5 last:border-b-0">
                    <p className="text-sm font-medium">
                      {lang === "ru" ? cfg.label_ru : cfg.label_en}
                      {e.actor_name && (
                        <span className="font-normal text-muted-foreground"> · {e.actor_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(e.created_date)}</p>
                    {e.details && <p className="mt-1 text-xs text-muted-foreground">{e.details}</p>}
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("req.noEvents")}</p>
            )}
          </div>
        </div>

        {/* Обсуждение */}
        <div>
          <h4 className="mb-3 text-sm font-semibold">{t("req.comments")}</h4>
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{c.author_name || "—"}</p>
                  {ROLES[c.author_role] && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {lang === "ru" ? ROLES[c.author_role].label_ru : ROLES[c.author_role].label_en}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{fmtDateTime(c.created_date)}</span>
                </div>
                <p className="mt-1 text-sm">{c.body}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("req.noComments")}</p>
            )}
          </div>

          <form onSubmit={send} className="mt-3 flex items-end gap-2">
            <Field label={t("req.commentPh")} className="flex-1">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder={t("req.commentPh")}
              />
            </Field>
            <Button type="submit" size="icon" loading={sending} title={t("req.send")}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
