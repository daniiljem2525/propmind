import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Booking } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { addDaysISO, formatDate, formatMoney, nightsBetween, todayISO } from "@/lib/utils";

// Слово «ночь» со склонениями: 1 ночь / 2 ночи / 5 ночей (ru), night / nights (en)
function nightWord(n, lang) {
  if (lang !== "ru") return n === 1 ? "night" : "nights";
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "ночь";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "ночи";
  return "ночей";
}

const emptyForm = (property) => ({
  guest_name: "",
  check_in: todayISO(),
  check_out: addDaysISO(todayISO(), 1),
  nightly_price: property?.rent_amount ?? "",
  notes: "",
});

// Заезды посуточного объекта: список + форма добавления/правки в одном диалоге.
export default function BookingsDialog({ property, open, onClose }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [rows, setRows] = useState(null); // null — загрузка
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    if (!property) return;
    try {
      const all = await Booking.list();
      setRows(all.filter((b) => b.property_id === property.id));
    } catch {
      setRows([]);
    }
  }, [property?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && property) {
      setRows(null);
      setForm(emptyForm(property));
      setEditingId(null);
      setError("");
      setDeleting(null);
      load();
    }
  }, [open, property?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // закрытый диалог без объекта не рендерим вовсе
  if (!open || !property) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const nights = nightsBetween(form.check_in, form.check_out);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.guest_name.trim() || !form.check_in || !form.check_out)
      return setError(t("bookings.required"));
    if (nights === 0) return setError(t("bookings.dateOrder"));
    setSaving(true);
    setError("");
    try {
      const payload = {
        property_id: property.id,
        property_name: property.name,
        guest_name: form.guest_name.trim(),
        check_in: form.check_in,
        check_out: form.check_out,
        nightly_price: Number(form.nightly_price) || 0,
        currency: property.currency || "RUB",
        notes: form.notes.trim(),
      };
      if (editingId) {
        await Booking.update(editingId, payload);
        toast.success(t("bookings.updated"));
      } else {
        await Booking.create(payload);
        toast.success(t("bookings.created"));
      }
      setForm(emptyForm(property));
      setEditingId(null);
      await load();
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await Booking.delete(deleting.id);
      toast.success(t("bookings.deleted"));
      setDeleting(null);
      await load();
    } catch {
      toast.error(t("errors.generic"));
    }
  };

  const startEdit = (b) => {
    setEditingId(b.id);
    setError("");
    setForm({
      guest_name: b.guest_name || "",
      check_in: b.check_in || todayISO(),
      check_out: b.check_out || addDaysISO(b.check_in || todayISO(), 1),
      nightly_price: b.nightly_price ?? "",
      notes: b.notes || "",
    });
  };

  // Активные и будущие заезды — сверху (по дате заезда), прошедшие — ниже
  const today = todayISO();
  const list = rows || [];
  const isActive = (b) => (b.check_out || "") >= today;
  const upcoming = list.filter(isActive).sort((a, b) => (a.check_in || "").localeCompare(b.check_in || ""));
  const past = list.filter((b) => !isActive(b)).sort((a, b) => (b.check_in || "").localeCompare(a.check_in || ""));

  const renderItem = (b) => {
    const n = nightsBetween(b.check_in, b.check_out);
    return (
      <li key={b.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{b.guest_name || "—"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(b.check_in, lang)} → {formatDate(b.check_out, lang)}
            {" · "}{n} {nightWord(n, lang)}
          </p>
          {b.notes && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{b.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-sm font-semibold">
            {formatMoney((Number(b.nightly_price) || 0) * n, b.currency || property.currency || "RUB", lang)}
          </span>
          <button
            onClick={() => startEdit(b)}
            title={t("common.edit")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDeleting(b)}
            title={t("common.delete")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      <Dialog
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          {t("bookings.title")}: {property.name}
        </span>
      }
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="bookings-form" loading={saving}>
            {editingId ? t("common.save") : t("bookings.add")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Список заездов */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {rows === null ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-md border bg-muted/40" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              {t("bookings.empty")}
            </p>
          ) : (
            <>
              <ul className="space-y-2">{upcoming.map(renderItem)}</ul>
              {past.length > 0 && (
                <>
                  <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("bookings.past")}
                  </p>
                  <ul className="space-y-2">{past.map(renderItem)}</ul>
                </>
              )}
            </>
          )}
        </div>

        {/* Форма добавления / правки */}
        <form id="bookings-form" onSubmit={submit} className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold text-primary">
            {editingId ? t("bookings.edit") : t("bookings.add")}
          </p>
          <Field label={t("bookings.guest")} required>
            <Input value={form.guest_name} onChange={set("guest_name")} placeholder={lang === "ru" ? "Анна Смирнова" : "Anna Smith"} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("bookings.checkIn")} required>
              <Input type="date" value={form.check_in} onChange={set("check_in")} />
            </Field>
            <Field label={t("bookings.checkOut")} required>
              <Input type="date" value={form.check_out} onChange={set("check_out")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("bookings.nightlyPrice")}>
              <Input type="number" min="0" step="100" value={form.nightly_price} onChange={set("nightly_price")} />
            </Field>
            <Field label={t("bookings.notes")}>
              <Input value={form.notes} onChange={set("notes")} placeholder={lang === "ru" ? "Приоритет заезду после 15:00" : "Check-in after 3 PM"} />
            </Field>
          </div>
          {nights > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("bookings.total")}:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(nights * (Number(form.nightly_price) || 0), property.currency || "RUB", lang)}
              </span>{" "}
              ({nights} {nightWord(nights, lang)})
            </p>
          )}
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
          )}
        </form>
      </div>
      </Dialog>

      {/* Подтверждение удаления — отдельным порталом поверх диалога */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        description={deleting?.guest_name}
      />
    </>
  );
}
