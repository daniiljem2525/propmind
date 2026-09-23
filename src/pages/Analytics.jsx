import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, PieChart as PieChartIcon, TrendingUp, Building2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCollection } from "@/hooks/useCollection";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { Payment, Property } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { PROPERTY_STATUS_CONFIG, PAYMENT_STATUS_CONFIG, CHART_COLORS } from "@/lib/config/statuses";
import { formatMoney, monthShort } from "@/lib/utils";

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

export default function Analytics() {
  const { t, lang } = useLang();
  const demo = useDemoSeed();
  const { data: payments } = useCollection(Payment);
  const { data: properties } = useCollection(Property);

  const paid = useMemo(
    () => payments.filter((p) => p.status === "paid" || p.status === "partial"),
    [payments]
  );

  // Доход по месяцам (12 месяцев назад — сегодня)
  const incomeData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: monthShort(d.getMonth(), lang), amount: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    paid.forEach((p) => {
      const d = new Date(p.paid_date || p.due_date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (byKey[key]) byKey[key].amount += Number(p.amount) || 0;
    });
    return months;
  }, [paid, lang]);

  const statusData = useMemo(
    () =>
      Object.entries(PROPERTY_STATUS_CONFIG)
        .map(([value, conf]) => ({
          value,
          name: lang === "ru" ? conf.label_ru : conf.label_en,
          count: properties.filter((p) => p.status === value).length,
        }))
        .filter((d) => d.count > 0),
    [properties, lang]
  );

  const topProperties = useMemo(() => {
    const byProperty = {};
    paid.forEach((p) => {
      const key = p.property_name || "—";
      byProperty[key] = (byProperty[key] || 0) + (Number(p.amount) || 0);
    });
    return Object.entries(byProperty)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [paid]);

  const paymentStatusData = useMemo(
    () =>
      Object.entries(PAYMENT_STATUS_CONFIG)
        .map(([value, conf]) => ({
          value,
          name: lang === "ru" ? conf.label_ru : conf.label_en,
          count: payments.filter((p) => p.status === value).length,
          amount: payments.filter((p) => p.status === value).reduce((s, p) => s + (Number(p.amount) || 0), 0),
        }))
        .filter((d) => d.count > 0),
    [payments, lang]
  );

  const now = new Date();
  const totalPaid = paid.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const expected = payments
    .filter((p) => ["pending", "overdue"].includes(p.status) && p.period_month === now.getMonth() + 1 && p.period_year === now.getFullYear())
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const maxTop = Math.max(...topProperties.map((x) => x.amount), 1);

  if (payments.length === 0 && properties.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t("analytics.title")} subtitle={t("analytics.subtitle")} />
        <EmptyState
          icon={PieChartIcon}
          title={t("analytics.noData")}
          description={t("dashboard.demoSubtitle")}
          action={
            <Button onClick={demo.run} loading={demo.loading}>
              {t("dashboard.loadDemo")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("analytics.title")} subtitle={t("analytics.subtitle")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Banknote} tile="bg-teal-500" label={t("analytics.totalPaid")} value={formatMoney(totalPaid, "RUB", lang)} />
        <StatCard icon={TrendingUp} tile="bg-emerald-500" label={t("analytics.expected")} value={formatMoney(expected, "RUB", lang)} />
      </div>

      {/* Доход по месяцам */}
      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.incomeByMonth")}</CardTitle>
          <CardDescription>{t("analytics.incomeByMonthSub")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={incomeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "currentColor", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "currentColor", fontSize: 12 }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatMoney(value, "RUB", lang), t("analytics.revenue")]}
                  cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                />
                <Bar dataKey="amount" fill="#14B8A6" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Статусы объектов */}
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.propertyStatuses")}</CardTitle>
            <CardDescription>
              {properties.length} · {t("nav.properties").toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("analytics.noData")}</p>
            ) : (
              <div className="flex flex-col items-center gap-4 text-muted-foreground sm:flex-row">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusData} dataKey="count" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0} isAnimationActive={false}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="w-full shrink-0 space-y-2 sm:w-44">
                  {statusData.map((d, i) => (
                    <li key={d.value} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="font-semibold text-foreground">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Статусы платежей */}
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.paymentStatuses")}</CardTitle>
            <CardDescription>
              {payments.length} {t("analytics.paymentsCount")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentStatusData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("analytics.noData")}</p>
            ) : (
              <div className="flex flex-col items-center gap-4 text-muted-foreground sm:flex-row">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={paymentStatusData} dataKey="count" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0} isAnimationActive={false}>
                      {paymentStatusData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="w-full shrink-0 space-y-2 sm:w-48">
                  {paymentStatusData.map((d, i) => (
                    <li key={d.value} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="shrink-0 font-semibold text-foreground">{formatMoney(d.amount, "RUB", lang)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Топ объектов */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("analytics.topProperties")}</CardTitle>
        </CardHeader>
        <CardContent>
          {topProperties.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("analytics.noData")}</p>
          ) : (
            <ul className="space-y-4">
              {topProperties.map((x, i) => (
                <li key={x.name} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{x.name}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">{formatMoney(x.amount, "RUB", lang)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="brand-gradient h-full rounded-full" style={{ width: `${(x.amount / maxTop) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
