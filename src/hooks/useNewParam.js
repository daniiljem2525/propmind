import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

// ?new=1 в адресе открывает диалог создания — и при заходе на страницу,
// и когда параметр появляется у уже открытой страницы (меню «+» в шапке)
export function useNewParam(onNew) {
  const [params] = useSearchParams();
  const location = useLocation();
  const isNew = params.get("new");
  // один location.key = одно срабатывание: повторный клик «+» на той же
  // странице даёт новую навигацию с новым key и должен открыть диалог заново
  const consumedKey = useRef(null);

  useEffect(() => {
    if (isNew !== "1" || consumedKey.current === location.key) return;
    consumedKey.current = location.key;
    // Параметр убираем из адресной строки напрямую через history:
    // setParams здесь запускает вторую навигацию посреди page-transition
    // (AnimatePresence mode="wait" в AppLayout), страница перемонтируется
    // и только что открытый диалог закрывается.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      window.history.replaceState(window.history.state, "", url);
    } catch {}
    onNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
}
