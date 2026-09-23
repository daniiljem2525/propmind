import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// ?new=1 в адресе открывает диалог создания — и при заходе на страницу,
// и когда параметр появляется у уже открытой страницы (меню «+» в шапке)
export function useNewParam(onNew) {
  const [params, setParams] = useSearchParams();
  const isNew = params.get("new");

  useEffect(() => {
    if (isNew === "1") {
      params.delete("new");
      setParams(params, { replace: true });
      onNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);
}
