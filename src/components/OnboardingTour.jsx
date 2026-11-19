import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Building2, Compass, Plus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { cn } from "@/lib/utils";

// Мини-обзор интерфейса при первом входе в приложение: короткие подсказки,
// привязанные к живым элементам (меню, «+», профиль). Флаг «показан» —
// в localStorage, один раз на устройство (как arendora:pushAsked).
//
// Кому показываем автоматически: устройство БЕЗ сессии на момент загрузки
// страницы — то есть новый пользователь, который только что зарегистрировался
// или впервые вошёл на этом устройстве. Вернувшиеся (PWA, перезагрузка —
// сессия уже была при старте бандла) тур не видят: не навязываем обзор тем,
// кто уже работает с приложением. Повтор для всех — настройка «Интерфейс» →
// «Показать подсказки» (событие arendora:start-tour).
const KEY = "arendora:onboarded";
export const START_EVENT = "arendora:start-tour";
const GATE_POLL_MS = 400;
const GATE_TIMEOUT_MS = 30000;
const PAD = 12;
const TIP_W = 340;

// Сессия на момент загрузки бандла: единственный момент, когда можно
// отличить вернувшегося от нового — дальше оба уже залогинены.
// Облачный режим хранит сессию под sb-<хост>-auth-token (localStorage
// и cookie, см. supabase/config.js), локальный — arendora:session.
const bootSession = (() => {
  try {
    if (localStorage.getItem("arendora:session") !== null) return true;
    if (Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))) return true;
    return /(?:^|; )sb-[a-z0-9]+-auth-token=/.test(document.cookie);
  } catch {
    return false;
  }
})();

export function resetOnboardingTour() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

function isSeen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
}

// Шаги собираются через t() и роль: у жильца и исполнителя свои порталы —
// тур про объекты и платежи им не нужен; бухгалтеру «+» недоступен по
// матрице ролей — шаг быстрого добавления отфильтруется.
function buildSteps(t, canCreate) {
  return [
    {
      id: "welcome",
      center: true,
      icon: Compass,
      title: t("tour.welcomeTitle"),
      text: t("tour.welcomeText"),
    },
    {
      id: "nav",
      icon: Building2,
      title: t("tour.navTitle"),
      text: t("tour.navText"),
      // На десктопе подсвечиваем меню в сайдбаре, на телефоне (сайдбар
      // скрыт) — гамбургер в шапке: подсказка ведёт к тому, что реально
      // видно пользователю на этом экране.
      targets: [
        { sel: '[data-tour="sidebar-nav"]', placement: "right" },
        { sel: '[data-tour="mobile-menu-btn"]', placement: "bottom" },
      ],
    },
    ...(canCreate
      ? [
          {
            id: "create",
            icon: Plus,
            title: t("tour.createTitle"),
            text: t("tour.createText"),
            targets: [{ sel: '[data-tour="quick-create"]', placement: "bottom" }],
          },
        ]
      : []),
    {
      id: "profile",
      icon: UserRound,
      title: t("tour.profileTitle"),
      text: t("tour.profileText"),
      targets: [{ sel: '[data-tour="profile"]', placement: "bottom" }],
    },
  ];
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

function sameSpot(a, b) {
  if (!a || !b) return a === b;
  const r1 = a.rect;
  const r2 = b.rect;
  return (
    a.placement === b.placement &&
    Math.round(r1.top) === Math.round(r2.top) &&
    Math.round(r1.left) === Math.round(r2.left) &&
    Math.round(r1.width) === Math.round(r2.width) &&
    Math.round(r1.height) === Math.round(r2.height)
  );
}

export default function OnboardingTour() {
  const { t } = useLang();
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  // Якорь шага: rect + placement, либо null — живого элемента на экране нет
  // (мобильный вариант берёт следующий target, иначе фолбэк-карточка внизу)
  const [spot, setSpot] = useState(null);
  // Готовая позиция карточки: считается после коммита, когда известна
  // фактическая высота подсказки
  const [tipPos, setTipPos] = useState(null);
  const tipRef = useRef(null);

  // Роли операционного рабочего места (см. матрицу в config/statuses.js):
  // legacy «user» и незагруженная роль — полный доступ, прежнее поведение.
  const canCreate =
    user === undefined || user === null || ["owner", "admin", "manager", "user"].includes(user?.role);
  const skipRoles = ["tenant", "contractor"].includes(user?.role);
  const steps = useMemo(() => buildSteps(t, canCreate), [t, canCreate]);

  const finish = useCallback(() => {
    markSeen();
    setActive(false);
    setSpot(null);
    setTipPos(null);
  }, []);

  const next = useCallback(() => {
    if (stepIdx >= steps.length - 1) {
      finish();
    } else {
      setStepIdx(stepIdx + 1);
    }
  }, [stepIdx, steps.length, finish]);

  // Гейт автостарта: ждём, пока не закроются модальные диалоги (push-онбординг
  // открывается в тот же момент после входа — тур под ним был бы мусором) и
  // баннер cookie (перехватывает первый экран; под оверлеем тура его кнопки
  // стали бы некликабельны). Таймаут — страховка: застрявший баннер не
  // блокирует обзор навсегда.
  useEffect(() => {
    if (active || skipRoles) return undefined;
    if (bootSession) {
      // Вернувшийся пользователь: сразу фиксируем «показан» — тур не навязываем
      markSeen();
      return undefined;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (isSeen()) {
        clearInterval(timer);
        return;
      }
      const modalOpen = document.querySelector('[aria-modal="true"]');
      const cookieBanner = document.querySelector("[data-cookie-banner]");
      const timeout = Date.now() - startedAt > GATE_TIMEOUT_MS;
      if (user !== undefined && (!modalOpen || timeout) && (!cookieBanner || timeout)) {
        clearInterval(timer);
        setStepIdx(0);
        setActive(true);
      }
    }, GATE_POLL_MS);
    return () => clearInterval(timer);
  }, [user, skipRoles, active]);

  // Повторный показ из настроек: работает у всех, флаг перезапишется на выходе
  useEffect(() => {
    const onStart = () => {
      if (skipRoles) return;
      setStepIdx(0);
      setSpot(null);
      setActive(true);
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [skipRoles]);

  // Esc — прервать обзор
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => e.key === "Escape" && finish();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, finish]);

  // Якорь пересчитывается каждый кадр, пока тур активен: покрывает скролл,
  // ресайз, анимацию сворачивания сайдбара. Стейт обновляется только при
  // фактическом изменении (округление до пикселя).
  useEffect(() => {
    if (!active) return undefined;
    const step = steps[stepIdx];
    let raf = 0;
    const tick = () => {
      let nextSpot = null;
      if (!step.center) {
        for (const target of step.targets) {
          const rect = document.querySelector(target.sel)?.getBoundingClientRect?.();
          const visible =
            rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
          if (visible) {
            nextSpot = { rect, placement: target.placement };
            break;
          }
        }
      }
      setSpot((prev) => (sameSpot(prev, nextSpot) ? prev : nextSpot));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, stepIdx, steps]);

  // Позиция карточки при живом якоре: считаем после коммита (высота текста
  // шага уже в DOM), размещаем справа от якоря / под ним, с переворотом и
  // клампом в вьюпорт. Пока позиция не готова — карточка за экраном
  // (измеряется без мигания).
  useLayoutEffect(() => {
    if (!active || !spot || steps[stepIdx].center) {
      setTipPos(null);
      return;
    }
    const { rect, placement } = spot;
    const tipH = tipRef.current?.offsetHeight || 150;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(TIP_W, vw - 2 * PAD);
    let left;
    let top;
    if (placement === "right") {
      left = rect.right + 10;
      if (left + w > vw - PAD) left = rect.left - 10 - w; // переворот влево
      top = rect.top + rect.height / 2 - tipH / 2;
    } else {
      top = rect.bottom + 10;
      if (top + tipH > vh - PAD) top = rect.top - tipH - 10; // переворот вверх
      left = rect.right - w; // по правому краю якоря
    }
    setTipPos({ top: clamp(top, PAD, vh - tipH - PAD), left: clamp(left, PAD, vw - w - PAD), width: w });
  }, [active, spot, stepIdx, steps]);

  if (!active || user === undefined) return null;

  const step = steps[stepIdx];
  const Icon = step.icon;
  const last = stepIdx === steps.length - 1;
  const anchored = Boolean(spot) && !step.center;
  const measuring = anchored && !tipPos;

  let tipClass;
  let tipStyle;
  if (anchored) {
    tipClass = "";
    tipStyle = measuring
      ? { position: "fixed", top: -9999, left: -9999, width: Math.min(TIP_W, window.innerWidth - 2 * PAD) }
      : { position: "fixed", top: tipPos.top, left: tipPos.left, width: tipPos.width };
  } else if (step.center) {
    // Приветственный шаг: карточка по центру. Без translate-классов:
    // framer-motion пишет inline transform и перекрывает их — вертикальное
    // центрирование делает y: "-50%" в motion-пропсах ниже.
    tipClass = "inset-x-4 top-1/2 mx-auto max-w-md";
    tipStyle = null;
  } else {
    // Фолбэк без якоря: карточка снизу — привычное место мобильных подсказок
    tipClass = "mx-auto max-w-md inset-x-4 bottom-4";
    tipStyle = null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      {/* Подсветка-«прожектор»: дырка над целевым элементом, всё вокруг
          затемнено огромной тенью (классический приём туров без 4 блоков) */}
      {spot && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute rounded-xl"
          style={{
            top: spot.rect.top - 6,
            left: spot.rect.left - 6,
            width: spot.rect.width + 12,
            height: spot.rect.height + 12,
            boxShadow: "0 0 0 3px rgba(99,102,241,0.4), 0 0 0 9999px rgba(15,23,42,0.55)",
          }}
        />
      )}

      <motion.div
        ref={tipRef}
        key={step.id}
        initial={step.center ? { opacity: 0, scale: 0.96, y: "-50%" } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={step.center ? { opacity: 1, scale: 1, y: "-50%" } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
          className={cn(
            tipClass,
            "rounded-lg border bg-card shadow-xl",
            !anchored && "absolute z-10"
          )}
          style={tipStyle || undefined}
          role="dialog"
          aria-label={step.title}
      >
        <div className="flex items-start gap-3 p-4">
          <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
          <button
            onClick={finish}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t("tour.skip")}
            aria-label={t("tour.skip")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === stepIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={finish}>
              {t("tour.skip")}
            </Button>
            <Button size="sm" onClick={next}>
              {last ? t("tour.finish") : t("tour.next")}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
