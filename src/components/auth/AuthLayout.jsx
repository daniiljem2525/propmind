import { Link } from "react-router-dom";
import { BarChart3, Building2, House, Sparkles, Wrench } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";

const FEATURES = {
  ru: [
    { icon: Sparkles, text: "Запуск за 15 минут — без внедрения" },
    { icon: Building2, text: "Объекты, арендаторы и платежи связаны автоматически" },
    { icon: Wrench, text: "Заявки, документы и аналитика в одном окне" },
  ],
  en: [
    { icon: Sparkles, text: "Up in 15 minutes — no onboarding" },
    { icon: Building2, text: "Properties, tenants and payments linked automatically" },
    { icon: Wrench, text: "Requests, documents and analytics in one place" },
  ],
};

// Сплэш-панель + форма для страниц аутентификации
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { lang } = useLang();

  return (
    <div className="flex min-h-screen">
      {/* Брендовая панель */}
      <div className="brand-gradient relative hidden w-[44%] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10" />

        <Link to="/login" className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <House className="h-6 w-6" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">PropMind</span>
        </Link>

        <div className="relative space-y-7">
          <h1 className="text-3xl font-bold leading-tight">
            {lang === "ru" ? "Управляйте портфелем недвижимости без таблиц и хаоса" : "Run your property portfolio without spreadsheets and chaos"}
          </h1>
          <ul className="space-y-4">
            {FEATURES[lang].map((f, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <f.icon className="h-4 w-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-white/70">
          <BarChart3 className="h-4 w-4" />
          {lang === "ru" ? "От 100+ объектов · RU / EN · Облачная платформа" : "100+ properties · RU / EN · Cloud platform"}
        </p>
      </div>

      {/* Форма */}
      <div className="flex w-full items-center justify-center bg-background px-4 py-10 lg:w-[56%]">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl">
              <House className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-extrabold">PropMind</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
