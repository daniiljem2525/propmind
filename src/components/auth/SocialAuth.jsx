import { loginWithSocial } from "@/lib/api/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useLang } from "@/lib/i18n/LangContext";

// Кнопки входа через Яндекс / VK / Mail.ru (только облачный режим:
// в localStorage-демо соц-входа нет). Провайдер — брендовый цвет
// с узнаваемой буквой/знаком, без внешних иконок-библиотек.

function YandexMark() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#FC3F1D] text-[13px] font-bold leading-none text-white">
      Я
    </span>
  );
}

function VkMark() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#0077FF]">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white" aria-hidden="true">
        <path d="M13.16 18.02c-5.65 0-8.87-3.87-9-10.31h2.83c.09 4.71 2.17 6.71 3.81 7.12V7.71h2.67v4.07c1.62-.17 3.32-2.02 3.9-4.07h2.66a7.85 7.85 0 0 1-3.61 5.14 8.13 8.13 0 0 1 4.22 5.17h-2.93a5.08 5.08 0 0 0-3.97-3.64v3.64h-.58Z" />
      </svg>
    </span>
  );
}

function MailruMark() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#005FF9] text-[12px] font-bold leading-none text-white">
      @
    </span>
  );
}

const MARKS = { yandex: YandexMark, vk: VkMark, mailru: MailruMark };
const NAME_KEYS = { yandex: "auth.social.yandex", vk: "auth.social.vk", mailru: "auth.social.mailru" };

export default function SocialAuth() {
  const { t } = useLang();
  if (!isSupabaseConfigured) return null;

  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-muted-foreground">{t("auth.socialOr")}</p>
      <div className="grid grid-cols-3 gap-2">
        {["yandex", "vk", "mailru"].map((p) => {
          const Mark = MARKS[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => loginWithSocial(p)}
              className="flex h-10 items-center justify-center gap-1.5 rounded-md border border-input bg-card px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted sm:text-sm"
            >
              <Mark />
              <span>{t(NAME_KEYS[p])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
