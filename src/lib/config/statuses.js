import {
  AlertTriangle,
  AlertCircle,
  Armchair,
  Banknote,
  BellRing,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CircleEllipsis,
  ClipboardCheck,
  Clock,
  Droplets,
  FileText,
  Home,
  Layers,
  Play,
  Plus,
  Receipt,
  ScrollText,
  Store,
  UserMinus,
  UserPlus,
  Warehouse,
  WashingMachine,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";

// ——— Статусы платежей ———
export const PAYMENT_STATUS_CONFIG = {
  paid: {
    label_ru: "Оплачен",
    label_en: "Paid",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  pending: {
    label_ru: "Ожидает",
    label_en: "Pending",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  overdue: {
    label_ru: "Просрочен",
    label_en: "Overdue",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  partial: {
    label_ru: "Частично",
    label_en: "Partial",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  cancelled: {
    label_ru: "Отменён",
    label_en: "Cancelled",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

// ——— Статусы объектов ———
export const PROPERTY_STATUS_CONFIG = {
  vacant: {
    label_ru: "Свободен",
    label_en: "Vacant",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  rented: {
    label_ru: "Сдаётся",
    label_en: "Rented",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  maintenance: {
    label_ru: "Обслуживание",
    label_en: "Maintenance",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  inactive: {
    label_ru: "Неактивен",
    label_en: "Inactive",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

// ——— Типы объектов ———
export const PROPERTY_TYPE_CONFIG = {
  apartment: { label_ru: "Квартира", label_en: "Apartment", icon: Building2, tile: "bg-teal-500" },
  house: { label_ru: "Дом", label_en: "House", icon: Home, tile: "bg-emerald-500" },
  commercial: { label_ru: "Коммерция", label_en: "Commercial", icon: Store, tile: "bg-indigo-500" },
  office: { label_ru: "Офис", label_en: "Office", icon: Briefcase, tile: "bg-violet-500" },
  warehouse: { label_ru: "Склад", label_en: "Warehouse", icon: Warehouse, tile: "bg-slate-500" },
  other: { label_ru: "Другое", label_en: "Other", icon: Layers, tile: "bg-rose-500" },
};

// ——— Статусы заявок ———
export const MAINTENANCE_STATUS_CONFIG = {
  new: {
    label_ru: "Новая",
    label_en: "New",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  assigned: {
    label_ru: "Назначена",
    label_en: "Assigned",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
  in_progress: {
    label_ru: "В работе",
    label_en: "In progress",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  done: {
    label_ru: "Выполнена",
    label_en: "Done",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  closed: {
    label_ru: "Принята",
    label_en: "Closed",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  completed: {
    label_ru: "Завершена",
    label_en: "Completed",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label_ru: "Отменена",
    label_en: "Cancelled",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

// ——— Срочность заявок ———
export const URGENCY_CONFIG = {
  low: {
    label_ru: "Низкая",
    label_en: "Low",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  },
  medium: {
    label_ru: "Средняя",
    label_en: "Medium",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  },
  high: {
    label_ru: "Высокая",
    label_en: "High",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  },
  emergency: {
    label_ru: "Срочная",
    label_en: "Emergency",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  },
};

// ——— Категории заявок ———
export const CATEGORY_CONFIG = {
  plumbing: { label_ru: "Сантехника", label_en: "Plumbing", icon: Droplets },
  electrical: { label_ru: "Электрика", label_en: "Electrical", icon: Zap },
  appliances: { label_ru: "Бытовая техника", label_en: "Appliances", icon: WashingMachine },
  furniture: { label_ru: "Мебель и интерьер", label_en: "Furniture", icon: Armchair },
  other: { label_ru: "Другое", label_en: "Other", icon: Wrench },
};

// ——— События в истории заявки ———
export const REQUEST_EVENT_CONFIG = {
  created: {
    label_ru: "Заявка создана", label_en: "Request created", icon: Plus,
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  },
  assigned: {
    label_ru: "Назначена исполнитель", label_en: "Assigned to contractor", icon: UserPlus,
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  },
  accepted: {
    label_ru: "Принята в работу", label_en: "Accepted for work", icon: Play,
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  reported: {
    label_ru: "Работа сдана", label_en: "Work reported", icon: ClipboardCheck,
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  },
  closed: {
    label_ru: "Работа принята", label_en: "Work accepted", icon: CheckCircle2,
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  cancelled: {
    label_ru: "Заявка отменена", label_en: "Request cancelled", icon: XCircle,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  },
  declined: {
    label_ru: "Исполнитель отклонил", label_en: "Declined by contractor", icon: UserMinus,
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  },
};

// ——— Статусы арендаторов ———
export const TENANT_STATUS_CONFIG = {
  active: {
    label_ru: "Активен",
    label_en: "Active",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  inactive: {
    label_ru: "Неактивен",
    label_en: "Inactive",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  },
  pending: {
    label_ru: "Ожидает",
    label_en: "Pending",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
};

// ——— Типы документов ———
export const DOC_TYPE_CONFIG = {
  contract: { label_ru: "Договор", label_en: "Contract", icon: ScrollText, tile: "bg-indigo-500" },
  act: { label_ru: "Акт", label_en: "Act", icon: FileText, tile: "bg-teal-500" },
  invoice: { label_ru: "Счёт", label_en: "Invoice", icon: Receipt, tile: "bg-amber-500" },
  receipt: { label_ru: "Квитанция", label_en: "Receipt", icon: Banknote, tile: "bg-emerald-500" },
  other: { label_ru: "Другое", label_en: "Other", icon: Layers, tile: "bg-rose-500" },
};

// ——— Типы уведомлений ———
export const NOTIFICATION_TYPE_CONFIG = {
  payment_overdue: { icon: AlertCircle, tile: "bg-rose-500" },
  payment_received: { icon: Banknote, tile: "bg-emerald-500" },
  maintenance_new: { icon: Wrench, tile: "bg-amber-500" },
  maintenance_assigned: { icon: Wrench, tile: "bg-indigo-500" },
  maintenance_updated: { icon: Clock, tile: "bg-sky-500" },
  lease_expiring: { icon: CalendarClock, tile: "bg-orange-500" },
  new_tenant: { icon: UserPlus, tile: "bg-indigo-500" },
  ai_report: { icon: BellRing, tile: "bg-violet-500" },
  general: { icon: BellRing, tile: "bg-teal-500" },
};

export const STATUS_ICONS = {
  new: CircleDashed,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
  warning: AlertTriangle,
  info: CircleEllipsis,
};

export function statusLabel(config, value, lang) {
  const item = config[value];
  if (!item) return value;
  return lang === "ru" ? item.label_ru : item.label_en;
}

export function typeLabel(config, value, lang) {
  const item = config[value];
  if (!item) return value;
  return lang === "ru" ? item.label_ru : item.label_en;
}

export const CHART_COLORS = ["#0F766E", "#14B8A6", "#6366F1", "#F43F5E", "#F59E0B", "#10B981", "#8B5CF6", "#64748B"];

// ——— Роли пользователей ———
export const ROLES = {
  owner: { label_ru: "Владелец", label_en: "Owner" },
  tenant: { label_ru: "Жилец", label_en: "Tenant" },
  contractor: { label_ru: "Исполнитель", label_en: "Contractor" },
  admin: { label_ru: "Администратор", label_en: "Admin" },
};
