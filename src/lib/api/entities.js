// Фасад сущностей: localStorage (по умолчанию) или Supabase (когда задан конфиг).
// Интерфейс одинаков — компоненты не знают, какой бэкенд активен.
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as local from "@/lib/data/localEntities";
import * as cloud from "@/lib/supabase/entities";
import {
  Inspection as OfflineInspection,
  flush,
  onSynced,
  pendingCount,
} from "@/lib/offline/inspections";

const backend = isSupabaseConfigured ? cloud : local;

export const Property = backend.Property;
export const Tenant = backend.Tenant;
export const Payment = backend.Payment;
export const Booking = backend.Booking;
export const AutomationOrder = backend.AutomationOrder;
export const ProfiOffer = backend.ProfiOffer;
export const MaintenanceRequest = backend.MaintenanceRequest;
export const RequestComment = backend.RequestComment;
export const RequestEvent = backend.RequestEvent;
export const getLandlordContact = backend.getLandlordContact;
export const claimInvite = backend.claimInvite;
export const notifyPaymentSchedule = backend.notifyPaymentSchedule;
export const payPayment = backend.payPayment;
export const Document = backend.Document;
export const NotificationEntity = backend.NotificationEntity;
// Инспекции — оффлайн-обёртка: в облачном режиме добавляет зеркало и outbox,
// в локальном просто проходит в localStorage (см. src/lib/offline/inspections.js)
export const Inspection = OfflineInspection;
export const syncInspections = flush;
export const onInspectionsSynced = onSynced;
export const inspectionsPendingCount = pendingCount;
export const registerCurrentUserFn = local.registerCurrentUserFn;
