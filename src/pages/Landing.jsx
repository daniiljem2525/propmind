import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Navigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Globe,
  House,
  LogIn,
  Quote,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { PLANS } from "@/lib/config/misc";
import { formatMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Zap, tile: "bg-amber-500", key: "land.f1" },
  { icon: CreditCard, tile: "bg-emerald-500", key: "land.f2" },
  { icon: Wrench, tile: "bg-indigo-500", key: "land.f3" },
  { icon: FileText, tile: "bg-rose-500", key: "land.f4" },
  { icon: BarChart3, tile: "bg-teal-500", key: "land.f5" },
  { icon: Globe, tile: "bg-violet-500", key: "land.f6" },
];

const FAQ_KEYS = ["land.q1", "land.q2", "land.q3", "land.q4"];

export default function Landing() {
  const { t, lang, setLang } = useLang();
  const { user } = useAuth();
  const [yearly, setYearly] = useState(false);
  if (user) return <Navigate to="/app" replace />;

  // Клик по логотипу: если мы уже на "/", плавно поднимаемся наверх
  const logoClick = (e) => {
    if (window.location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const anchorNav = [
    { href: "#features", key: "land.navFeatures" },
    { href: "#how", key: "land.navHow" },
    { href: "#pricing", key: "land.navPricing" },
    { href: "#faq", key: "land.navFaq" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 lg:px-8">
          <Link to="/" onClick={logoClick} className="flex items-center gap-2.5">
            <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-lg">
              <House className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">PropMind</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            {anchorNav.map((a) => (
              <a key={a.href} href={a.href} className="transition-colors hover:text-foreground">
                {t(a.key)}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "ru" ? "en" : "ru")}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Globe className="h-4 w-4" />
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                {lang === "ru" ? "RU" : "EN"}
              </span>
            </button>
            <Link
              to="/login"
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <LogIn className="h-4 w-4" />
              {t("auth.signIn")}
            </Link>
            <Link
              to="/register"
              className="brand-gradient inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              {t("land.cta")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center lg:px-8 lg:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("land.badge")}
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {t("land.heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t("land.heroSub")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="brand-gradient inline-flex items-center gap-2 rounded-md px-7 py-3 text-base font-semibold text-white shadow-card-hover transition-opacity hover:opacity-90"
            >
              {t("land.ctaStart")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-md border bg-card px-7 py-3 text-base font-semibold transition-colors hover:bg-muted"
            >
              {t("land.ctaPricing")}
            </a>
          </div>

          {/* Гарантии под CTA */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {[
              { icon: CreditCard, key: "land.guarantee1" },
              { icon: Timer, key: "land.guarantee2" },
              { icon: ShieldCheck, key: "land.guarantee3" },
            ].map((g) => (
              <span key={g.key} className="inline-flex items-center gap-1.5">
                <g.icon className="h-4 w-4 text-primary" />
                {t(g.key)}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("land.heroTrust")}</p>

          {/* Живой пример дашборда + лента событий */}
          <LiveDemo />
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="border-t bg-card/50 py-20">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">{t("land.featuresTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("land.featuresSub")}</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.key} className="rounded-lg border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover">
                <span className={cn("flex h-11 w-11 items-center justify-center rounded-lg text-white", f.tile)}>
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{t(`${f.key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`${f.key}.text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="py-20">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">{t("land.howTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("land.howSub")}</p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {["land.step1", "land.step2", "land.step3"].map((k, i) => (
              <div key={k} className="relative text-center">
                <span className="brand-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold text-white shadow-card">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{t(`${k}.title`)}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{t(`${k}.text`)}</p>
                {i < 2 && (
                  <ArrowRight className="absolute -right-5 top-4 hidden h-5 w-5 text-muted-foreground/40 md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Сравнение */}
      <section className="border-t bg-card/50 py-20">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">{t("land.compareTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("land.compareSub")}</p>
          </div>
          <div className="mt-10 overflow-hidden rounded-lg border bg-card shadow-card">
            <div className="grid grid-cols-4 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="px-4 py-3">{t("land.compare")}</div>
              <div className="px-4 py-3 text-center">{t("land.compareSpreadsheets")}</div>
              <div className="px-4 py-3 text-center">{t("land.compareEnterprise")}</div>
              <div className="bg-primary/5 px-4 py-3 text-center text-primary">{t("land.comparePropmind")}</div>
            </div>
            {["rowLaunch", "rowLinks", "rowSchedule", "rowCost", "rowSupport"].map((row, i) => (
              <div key={row} className={cn("grid grid-cols-4 text-sm", i !== 4 && "border-b")}>
                <div className="px-4 py-3 font-medium">{t(`land.${row}`)}</div>
                <div className="px-4 py-3 text-center text-muted-foreground">{t(`land.${row}.s1`)}</div>
                <div className="px-4 py-3 text-center text-muted-foreground">{t(`land.${row}.s2`)}</div>
                <div className="bg-primary/5 px-4 py-3 text-center font-semibold">{t(`land.${row}.s3`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Отзывы */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">{t("land.testimonialsTitle")}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {["land.t1", "land.t2", "land.t3"].map((k) => (
              <div key={k} className="flex flex-col rounded-lg border bg-card p-5 shadow-card">
                <Quote className="h-5 w-5 text-primary/40" />
                <p className="mt-3 flex-1 text-sm leading-relaxed">{t(`${k}.text`)}</p>
                <div className="mt-5 flex items-center gap-3 border-t pt-4">
                  <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                    {t(`${k}.name`).slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{t(`${k}.name`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`${k}.role`)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Тарифы */}
      <section id="pricing" className="border-t bg-card/50 py-20">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">{t("land.pricingTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("land.pricingSub")}</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="col-span-full mb-[-8px] flex justify-center md:col-span-full">
              <div className="inline-flex rounded-md border bg-card p-1 shadow-sm">
                {[["monthly", false], ["yearly", true]].map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setYearly(val)}
                    className={cn(
                      "rounded px-4 py-1.5 text-sm font-medium transition-colors",
                      yearly === val ? "brand-gradient text-white" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(`plans.${key}`)}
                    {val && <span className="ml-1.5 text-[10px] font-bold">{t("plans.yearlyBadge")}</span>}
                  </button>
                ))}
              </div>
            </div>
            {PLANS.map((p) => {
              const price = yearly ? p.yearly : p.monthly;
              return (
              <div
                key={p.id}
                className={cn(
                  "relative flex flex-col rounded-lg border bg-card p-5 shadow-card",
                  p.highlight && "border-primary ring-2 ring-primary"
                )}
              >
                {p.highlight && (
                  <span className="brand-gradient absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    ★ Pro
                  </span>
                )}
                <h3 className="text-lg font-bold">{t(`plans.${p.id}.name`)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t(`plans.${p.id}.desc`)}</p>
                <p className="mt-4">
                  <span className="text-2xl font-extrabold">{formatMoney(price, "RUB", lang)}</span>
                  <span className="text-sm text-muted-foreground">{yearly ? t("plans.perYear") : t("plans.perMonth")}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2.5">
                  {t(`plans.${p.id}.features`)
                    .split("|")
                    .map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                </ul>
                <Link
                  to="/register"
                  className={cn(
                    "mt-5 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity",
                    p.highlight
                      ? "brand-gradient text-white shadow-sm hover:opacity-90"
                      : "border bg-card hover:bg-muted"
                  )}
                >
                  {t("land.cta")}
                </Link>
              </div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t("land.pricingNote")}{" "}
            <a href={`mailto:sales@propmind.app?subject=${encodeURIComponent(t("plans.contactSubject"))}`} className="font-medium text-primary hover:underline">
              {t("plans.contactUs")}
            </a>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">{t("land.faqTitle")}</h2>
          <div className="mt-10 space-y-3">
            {FAQ_KEYS.map((k, i) => (
              <details key={k} open={i === 0} className="group rounded-lg border bg-card px-5 py-4 shadow-card">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
                  {t(`${k}.q`)}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`${k}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Финальный CTA */}
      <section className="px-4 pb-20 lg:px-8">
        <div className="brand-gradient mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-lg p-10 text-center text-white shadow-card-hover">
          <h2 className="text-2xl font-extrabold sm:text-3xl">{t("land.finalTitle")}</h2>
          <p className="max-w-xl text-white/85">{t("land.finalSub")}</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-md bg-white px-7 py-3 text-base font-semibold text-primary shadow-sm transition-opacity hover:opacity-90"
          >
            {t("land.ctaStart")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Мобильный закреплённый CTA */}
      <div className="sticky bottom-0 z-40 border-t bg-card/95 p-3 backdrop-blur sm:hidden">
        <Link
          to="/register"
          className="brand-gradient flex items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white shadow-sm"
        >
          {t("land.stickyCta")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Футер */}
      <footer className="border-t bg-card py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg">
              <House className="h-4 w-4 text-white" />
            </span>
            <span className="font-extrabold tracking-tight">PropMind</span>
            <span className="text-sm text-muted-foreground">© 2026</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">{t("land.navFeatures")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("land.navPricing")}</a>
            <a href="#faq" className="hover:text-foreground">{t("land.navFaq")}</a>
            <Link to="/login" className="hover:text-foreground">{t("auth.signIn")}</Link>
            <Link to="/register" className="font-medium text-primary hover:underline">{t("land.cta")}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ——— Живой пример дашборда: цифры тикают, оплаты «проходят», события появляются ———
function LiveDemo() {
  const { t } = useLang();
  const [stats, setStats] = useState({ props: 0, tenants: 0, requests: 0, income: 0 });
  const [paidRow, setPaidRow] = useState(-1);
  const [feedIdx, setFeedIdx] = useState(0);

  const events = [t("land.feed1"), t("land.feed2"), t("land.feed3"), t("land.feed4"), t("land.feed5")];
  const rows = [
    { name: "Марина Ким", amount: "260 000 ₽" },
    { name: "Дмитрий Орлов", amount: "350 000 ₽" },
    { name: "ООО «Меридиан»", amount: "480 000 ₽" },
  ];

  useEffect(() => {
    // счётчики разгоняются при появлении блока
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min((now - t0) / 1600, 1);
      const e = 1 - Math.pow(1 - k, 3);
      setStats({
        props: Math.round(8 * e),
        tenants: Math.round(6 * e),
        requests: Math.round(3 * e),
        income: Math.round(645000 * e),
      });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // оплаты «проходят» по очереди
    const badgeTimer = setInterval(() => setPaidRow((v) => (v + 1) % 4), 3200);
    // лента событий
    const feedTimer = setInterval(() => setFeedIdx((v) => (v + 1) % events.length), 2600);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(badgeTimer);
      clearInterval(feedTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (v) => v.toLocaleString("ru-RU");
  const statTiles = [
    { icon: Building2, tile: "bg-teal-500", label: t("land.mockProps"), value: String(stats.props) },
    { icon: Users, tile: "bg-indigo-500", label: t("land.mockTenants"), value: String(stats.tenants) },
    { icon: Wrench, tile: "bg-amber-500", label: t("land.mockRequests"), value: String(stats.requests) },
    { icon: CreditCard, tile: "bg-emerald-500", label: t("land.mockIncome"), value: money(stats.income) + " ₽" },
  ];

  return (
    <div className="relative mx-auto mt-14 max-w-4xl text-left">
      <div className="rounded-lg border bg-card p-3 shadow-card-hover sm:p-4">
        <div className="flex gap-1.5 pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>

        {/* Статистика с тикающими цифрами */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTiles.map((s, i) => (
            <div key={i} className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-md text-white", s.tile)}>
                  <s.icon className="h-3.5 w-3.5" />
                </span>
                <p className="truncate text-[11px] text-muted-foreground">{s.label}</p>
              </div>
              <p className="mt-1.5 truncate text-sm font-bold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Платежи, которые «проходят» */}
        <div className="mt-3 divide-y rounded-md border bg-background">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {r.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.name}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{r.amount}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-500",
                  i < paidRow
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                )}
              >
                {i < paidRow ? t("land.mockPaid") : t("land.mockPending")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Лента событий — «прямой эфир» платформы (референс any.run) */}
      <div className="mt-3 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-card">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("land.feedTitle")}
        </span>
        <span key={feedIdx} className="min-w-0 flex-1 animate-fade-in truncate text-sm">
          {events[feedIdx]}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{t("land.feedJustNow")}</span>
      </div>
    </div>
  );
}
