// Демо-данные в один клик: объекты, арендаторы, история платежей,
// заявки, документы и уведомления для текущего пользователя.

import { Property, Tenant, Payment, MaintenanceRequest, Document, NotificationEntity } from "@/lib/api/entities";
import { getCurrentUser } from "@/lib/api/auth";
import { todayISO, addDaysISO, addMonthsISO } from "@/lib/utils";

const photo = (seed) => `https://picsum.photos/seed/${seed}/640/420`;

function monthISO(offsetMonths, day) {
  const base = addMonthsISO(todayISO(), offsetMonths);
  const [y, m] = base.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

const DEMO_PROPERTIES = [
  {
    name: "ЖК «Северный парк», кв. 42",
    address: "Москва, ул. Павла Корчагина, 12",
    type: "apartment",
    rent_amount: 85000,
    status: "rented",
    rooms: 2,
    floor: 7,
    area_sqm: 54,
    photo_url: photo("propmind-north"),
    description: "Светлая квартира с ремонтом, оборудованная кухня, парковочное место в подземном паркинге.",
    lease_end_days: 45,
  },
  {
    name: "ЖК «Алые Паруса», кв. 118",
    address: "Москва, ул. Крылатская, 37",
    type: "apartment",
    rent_amount: 210000,
    status: "rented",
    rooms: 3,
    floor: 12,
    area_sqm: 96,
    photo_url: photo("propmind-sails"),
    description: "Видовая квартира на Москву-реке, дизайнерский ремонт, консьерж.",
    lease_end_days: 300,
  },
  {
    name: "Дом в Жуковке",
    address: "Одинцовский р-н, пос. Жуковка, Клубный пер., 4",
    type: "house",
    rent_amount: 350000,
    status: "rented",
    rooms: 6,
    area_sqm: 320,
    photo_url: photo("propmind-house"),
    description: "Двухэтажный дом, участок 12 соток, баня, охраняемый посёлок.",
    lease_end_days: 25,
  },
  {
    name: "Офис на Тверской",
    address: "Москва, ул. Тверская, 18, стр. 1",
    type: "office",
    rent_amount: 480000,
    status: "rented",
    rooms: 6,
    floor: 3,
    area_sqm: 180,
    description: "Офис open-space в историческом здании, отдельный вход, 12 рабочих мест.",
    lease_end_days: 200,
  },
  {
    name: "Помещение у метро «Маяковская»",
    address: "Санкт-Петербург, Невский пр-т, 114",
    type: "commercial",
    rent_amount: 260000,
    status: "rented",
    rooms: 2,
    floor: 1,
    area_sqm: 145,
    description: "Стрит-ритейл с витринами на Невский проспект, высокий трафик.",
    lease_end_days: 120,
  },
  {
    name: "Студия у Технопарка",
    address: "Москва, ул. Верхняя Красносельская, 11",
    type: "apartment",
    rent_amount: 62000,
    status: "maintenance",
    rooms: 1,
    floor: 9,
    area_sqm: 28,
    description: "Студия после арендатора, идёт подготовка к новому заселению.",
    lease_end_days: 330,
  },
  {
    name: "Склад в Люберцах",
    address: "Люберцы, ул. Инициативная, 12",
    type: "warehouse",
    rent_amount: 190000,
    status: "vacant",
    area_sqm: 540,
    description: "Тёплый склад, высота 8 м, ворота для фур, ж/д тупик.",
    lease_end_days: 330,
  },
  {
    name: "Квартира на Московской",
    address: "Санкт-Петербург, Московский пр-т, 209",
    type: "apartment",
    rent_amount: 74000,
    status: "vacant",
    rooms: 2,
    floor: 4,
    area_sqm: 58,
    description: "Квартира рядом с парком Победы, свежий ремонт.",
    lease_end_days: 330,
  },
];

const DEMO_TENANTS = [
  { full_name: "Игорь Соколов", email: "igor.sokolov@example.com", phone: "+7 916 350-12-04", propertyIndex: 0 },
  { full_name: "Анна Ветрова", email: "anna.vetrova@example.com", phone: "+7 903 771-88-42", propertyIndex: 1 },
  { full_name: "Дмитрий Орлов", email: "d.orlov@grand-llc.ru", phone: "+7 925 140-55-19", propertyIndex: 2 },
  { full_name: "ООО «Меридиан»", email: "office@meridian-co.ru", phone: "+7 495 221-30-77", propertyIndex: 3 },
  { full_name: "Марина Ким", email: "marina.kim@example.com", phone: "+7 921 988-03-61", propertyIndex: 4 },
];

export async function seedDemoData() {
  const user = getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const existing = await Property.list();
  if (existing.length > 0) return { skipped: true };

  // Демо-режим: открываем полный тариф Pro, чтобы ничто не блокировалось лимитами
  try {
    localStorage.setItem("propmind:plan", "pro");
  } catch {}

  // ——— Объекты ———
  const properties = [];
  for (const p of DEMO_PROPERTIES) {
    const { lease_end_days, ...data } = p;
    properties.push(
      await Property.create({
        ...data,
        currency: "RUB",
        lease_start: monthISO(-10, 1),
        lease_end: addDaysISO(todayISO(), lease_end_days),
      })
    );
  }

  // ——— Арендаторы + автосвязывание (без первого платежа — историю создаём сами) ———
  const tenants = [];
  for (const t of DEMO_TENANTS) {
    const property = properties[t.propertyIndex];
    const tenant = await Tenant.create({
      full_name: t.full_name,
      email: t.email,
      phone: t.phone,
      property_id: property.id,
      property_name: property.name,
      move_in_date: property.lease_start,
    });
    await Property.update(property.id, {
      tenant_id: tenant.id,
      tenant_name: tenant.full_name,
      status: "rented",
    });
    tenants.push({ tenant, property });
  }

  // ——— Платежи: 6 месяцев истории + текущий + следующий ———
  let paymentCount = 0;
  for (let i = 0; i < tenants.length; i++) {
    const { tenant, property } = tenants[i];
    for (let m = -6; m <= 1; m++) {
      const due = monthISO(m, 5);
      const [y, mo, d] = due.split("-").map(Number);
      let status = "pending";
      let paid_date = null;
      let payment_method = null;

      if (m < 0) {
        status = "paid";
        paid_date = addDaysISO(due, 1 + (i % 3));
        payment_method = "bank";
        if (m === -1 && i === 1) status = "partial"; // у одного арендатора частичная оплата
      } else if (m === 0) {
        // В текущем месяце часть оплат уже прошла — доход месяца виден на дашборде
        if (i === 3) {
          status = "overdue";
        } else if (i === 0 || i === 2) {
          status = "paid";
          paid_date = addDaysISO(due, 2);
          payment_method = "bank";
        } else if (i === 1) {
          status = "partial";
          paid_date = addDaysISO(due, 2);
        }
      }

      await Payment.create({
        property_id: property.id,
        property_name: property.name,
        tenant_id: tenant.id,
        tenant_name: tenant.full_name,
        amount: property.rent_amount,
        currency: "RUB",
        due_date: due,
        status,
        paid_date,
        payment_method,
        period_month: mo,
        period_year: y,
      });
      paymentCount++;
    }
  }

  // ——— Заявки ———
  const requests = [
    {
      title: "Течёт труба под раковиной",
      description: "На кухне под мойкой образовалась течь, вода собирается в поддон. Нужно срочно вызвать сантехника.",
      propertyIndex: 0,
      urgency: "emergency",
      status: "in_progress",
      source: "tenant_portal",
      assigned_to: "Сантехник Пётр Смирнов",
    },
    {
      title: "Не работает домофон",
      description: "Домофон не открывает подъезд с трубки, гости не могут дозвониться.",
      propertyIndex: 1,
      urgency: "medium",
      status: "new",
      source: "ai_bot",
    },
    {
      title: "Заклинило оконную раму",
      description: "Одно окно в переговорной не закрывается до конца, сквозит.",
      propertyIndex: 3,
      urgency: "low",
      status: "completed",
      source: "manual",
      assigned_to: "Мастер Артём Кузнецов",
      resolution_notes: "Заменён регулировочный механизм створки, окно работает штатно.",
      completed_date: addDaysISO(todayISO(), -12),
    },
    {
      title: "Перегорело освещение витрины",
      description: "Часть витринной подсветки не работает, нужен замена ламп.",
      propertyIndex: 4,
      urgency: "high",
      status: "new",
      source: "manual",
    },
  ];
  for (const r of requests) {
    const { propertyIndex, ...data } = r;
    const property = properties[propertyIndex];
    const tenant = tenants.find((t) => t.property.id === property.id)?.tenant || null;
    await MaintenanceRequest.create({
      ...data,
      property_id: property.id,
      property_name: property.name,
      tenant_id: tenant?.id || null,
      tenant_name: tenant?.full_name || null,
    });
  }

  // ——— Документы ———
  const docs = [
    { name: "Договор аренды №42-АР", type: "contract", propertyIndex: 0, file_name: "dogovor-42.pdf", file_size: 248320, notes: "Подписан на 11 месяцев" },
    { name: "Акт приёма-передачи квартиры", type: "act", propertyIndex: 0, file_name: "akt-42.pdf", file_size: 96200, notes: null },
    { name: "Счёт на оплату за сентябрь", type: "invoice", propertyIndex: 1, file_name: "invoice-sept.pdf", file_size: 45120, notes: null },
  ];
  for (const d of docs) {
    const { propertyIndex, ...data } = d;
    const property = properties[propertyIndex];
    await Document.create({ ...data, property_id: property.id, property_name: property.name, file_url: "" });
  }

  // ——— Уведомления ———
  await NotificationEntity.bulkCreate([
    {
      user_id: user.id,
      type: "payment_overdue",
      title: "Просроченный платёж",
      message: `«${tenants[3].property.name}»: арендатор не оплатил текущий месяц.`,
      is_read: false,
      link: "/app/payments",
    },
    {
      user_id: user.id,
      type: "maintenance_new",
      title: "Новая срочная заявка",
      message: `«Течёт труба под раковиной» — объект «${tenants[0].property.name}».`,
      is_read: false,
      link: "/app/maintenance",
    },
    {
      user_id: user.id,
      type: "lease_expiring",
      title: "Договор истекает через 25 дней",
      message: `«${tenants[2].property.name}» — продлите договор или подготовьте объект к сдаче.`,
      is_read: true,
      link: "/app/properties",
    },
  ]);

  return {
    skipped: false,
    counts: { properties: properties.length, tenants: tenants.length, payments: paymentCount, requests: requests.length, documents: docs.length },
  };
}
