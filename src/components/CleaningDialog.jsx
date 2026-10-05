import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { AutomationOrder, MaintenanceRequest } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

// Клининг по кнопке для посуточной сдачи: заявка + заказ на Профи.ру.
// Бот договорится с клинером; если раньше уже работали с кем-то —
// приедет проверенный (повторный найм в воркере).
const WHEN = [
  { v: "today", ru: "Сегодня", en: "Today" },
  { v: "tomorrow", ru: "Завтра", en: "Tomorrow" },
  { v: "week", ru: "На этой неделе", en: "This week" },
];

export default function CleaningDialog({ property, open, onClose }) {
  const { lang } = useLang();
  const toast = useToast();
  const [when, setWhen] = useState("today");
  const [time, setTime] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const details = [
        lang === "ru"
          ? "Клининг квартиры после выезда гостей."
          : "Apartment cleaning after guests check-out.",
        time.trim()
          ? (lang === "ru" ? "Желательное время: " : "Preferred time: ") + time.trim()
          : "",
        comment.trim(),
      ]
        .filter(Boolean)
        .join(" ");

      // заявка — для истории и таймлайна в разделе «Заявки»
      const req = await MaintenanceRequest.create({
        title: lang === "ru" ? `Клининг: ${property.name}` : `Cleaning: ${property.name}`,
        description: details,
        category: "other",
        urgency: when === "today" ? "high" : "medium",
        property_id: property.id,
        property_name: property.name,
      });
      // заказ в очередь воркера
      await AutomationOrder.create({
        request_id: req.id,
        platform: "profi",
        service_query: "клининг",
        details: details.slice(0, 900),
        address: property.address || null,
        deadline: when,
      });
      toast.success(
        lang === "ru"
          ? "Клининг заказан: бот договорится с клинером и согласует время"
          : "Cleaning ordered: the bot will arrange it and confirm the time",
      );
      onClose();
    } catch {
      toast.error(lang === "ru" ? "Не удалось создать заказ" : "Failed to create order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={lang === "ru" ? "Вызвать клининг" : "Book cleaning"} size="md">
      <form onSubmit={submit} className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          {lang === "ru"
            ? `Объект: ${property.name}. Бот найдёт клинера на Профи.ру — если раньше кто-то уже убирал, напишет ему.`
            : `Property: ${property.name}. The bot will find a cleaner on Profi.ru.`}
        </p>
        <Field label={lang === "ru" ? "Когда приехать" : "When"}>
          <Select value={when} onChange={(e) => setWhen(e.target.value)}>
            {WHEN.map((w) => (
              <option key={w.v} value={w.v}>
                {lang === "ru" ? w.ru : w.en}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={lang === "ru" ? "Во сколько (необязательно)" : "Time (optional)"}
          hint={lang === "ru" ? "Например: после 15:00 или к 12:00" : "e.g. after 15:00"}
        >
          <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder={lang === "ru" ? "после 15:00" : "after 15:00"} />
        </Field>
        <Field label={lang === "ru" ? "Комментарий (необязательно)" : "Comment (optional)"}>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={lang === "ru" ? "После выезда гостей, 2 гостя,нить и полотенца заменить" : "After check-out, replace linens"}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {lang === "ru" ? "Отмена" : "Cancel"}
          </Button>
          <Button type="submit" loading={busy}>
            <Sparkles className="h-4 w-4" />
            {lang === "ru" ? "Заказать клининг" : "Book cleaning"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
