import { useEffect, useState } from "react";
import { Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ROLES } from "@/lib/config/statuses";
import { planAllowsTeam } from "@/lib/config/misc";
import { cn, initials } from "@/lib/utils";

// Роли зависят от бэкенда: в облаке — команда целиком (управляющий и
// бухгалтер — тариф Бизнес, planAllowsTeam), локально — легаси user/admin
const ROLE_OPTIONS = isSupabaseConfigured
  ? ["owner", "manager", "accountant", "tenant", "contractor"]
  : ["user", "admin"];
// Кого можно пригласить: жилец и исполнитель — всем; менеджер/бухгалтер —
// условие покупки тарифа Бизнес (см. planAllowsTeam)
const INVITE_OPTIONS = isSupabaseConfigured
  ? ["tenant", "contractor", "manager", "accountant"]
  : ["user", "admin"];
const PLAN_OPTIONS = ["free", "start", "pro", "business", "individual"];

// Атрибуция рекламного трафика (utm из metadata аккаунта, пишется при
// регистрации): «yandex · search-bofu-product», нет данных — прочерк
function formatUtm(utm) {
  if (!utm) return "—";
  return [utm.source, utm.campaign].filter(Boolean).join(" · ") || "—";
}

// Управление пользователями — используется в Настройках и Админ-панели (только admin)
export default function UsersPanel() {
  const { t, lang } = useLang();
  const toast = useToast();
  const { user, listUsers, updateUserRole, updateUserPlan, inviteUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Роли команды (manager/accountant) — условие покупки тарифа Бизнес:
  // на free/start/pro в приглашении остаются только жилец и исполнитель
  const teamAllowed = planAllowsTeam(user?.plan);
  const defaultInviteRole = isSupabaseConfigured ? "tenant" : "user";
  const [inviteForm, setInviteForm] = useState({ email: "", role: defaultInviteRole });
  const [inviteSaving, setInviteSaving] = useState(false);

  const reload = () => Promise.resolve(listUsers()).then((rows) => setUsers(rows ?? []));
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusLabels = {
    active: lang === "ru" ? "Активен" : "Active",
    pending: lang === "ru" ? "Ожидает" : "Pending",
    invited: lang === "ru" ? "Приглашён" : "Invited",
  };

  const changeRole = async (u, role) => {
    try {
      await updateUserRole(u.id, role);
      toast.success(t("settings.roleChanged"));
      reload();
    } catch {
      toast.error(t("errors.generic"));
    }
  };

  // Ручная выдача тарифа пользователю (админ)
  const changePlan = async (u, plan) => {
    try {
      await updateUserPlan(u.id, plan);
      toast.success(t("admin.planChanged"));
      reload();
    } catch {
      toast.error(t("errors.generic"));
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) return;
    setInviteSaving(true);
    try {
      await inviteUser(inviteForm.email, inviteForm.role);
      toast.success(t("settings.inviteSent"));
      setInviteOpen(false);
      setInviteForm({ email: "", role: defaultInviteRole });
      reload();
    } catch (err) {
      toast.error(err.message === "EMAIL_EXISTS" ? t("auth.errors.emailExists") : t("errors.generic"));
    } finally {
      setInviteSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("settings.tabUsers")}</CardTitle>
          <CardDescription className="mt-0.5">{t("settings.inviteTitle")}</CardDescription>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          {t("settings.inviteUser")}
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {users.map((u) => (
          <div key={u.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
              {initials(u.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.full_name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                {u.email}
              </p>
              <p className="truncate text-xs text-muted-foreground" title={formatUtm(u.utm)}>
                {t("admin.utmLabel")}: {formatUtm(u.utm)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                u.status === "active"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400"
              )}
            >
              {statusLabels[u.status] || u.status}
            </span>
            <Select
              value={u.role}
              disabled={u.id === user.id}
              onChange={(e) => changeRole(u, e.target.value)}
              className="h-9 shrink-0 sm:w-40"
              title={t("settings.roleAdmin")}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {lang === "ru" ? ROLES[r].label_ru : ROLES[r].label_en}
                </option>
              ))}
            </Select>
            <Select
              value={u.plan || "free"}
              disabled={u.id === user.id}
              onChange={(e) => changePlan(u, e.target.value)}
              className="h-9 shrink-0 sm:w-44"
              title={t("plans.adminOnly")}
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {t(`plans.${p}.name`)}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </CardContent>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t("settings.inviteTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="invite-form" type="submit" loading={inviteSaving}>
              {t("settings.inviteUser")}
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={sendInvite} className="space-y-4">
          <Field label={t("auth.email")} required>
            <Input
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="colleague@company.com"
              autoFocus
            />
          </Field>
          <Field label={t("settings.role")}>
            <Select value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}>
              {INVITE_OPTIONS.filter((r) => teamAllowed || !["manager", "accountant"].includes(r)).map((r) => (
                <option key={r} value={r}>
                  {lang === "ru" ? ROLES[r]?.label_ru : ROLES[r]?.label_en}
                </option>
              ))}
            </Select>
          </Field>
          {!teamAllowed && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              {t("settings.teamUpsell")}
            </p>
          )}
        </form>
      </Dialog>
    </Card>
  );
}
