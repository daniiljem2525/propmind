import { useEffect, useState, useCallback } from "react";
import { subscribe } from "@/lib/api/db";

// useCollection(Entity) — данные + realtime-обновление при любых мутациях
// (в этой вкладке и в соседних) и при смене пользователя.
export function useCollection(entity) {
  const [rows, setRows] = useState(null);

  const load = useCallback(() => {
    entity
      .list()
      .then(setRows)
      .catch(() => setRows([]));
  }, [entity]);

  useEffect(() => {
    load();
    const unsubData = subscribe(entity.collection, load);
    const unsubAuth = subscribe("auth", load);
    return () => {
      unsubData();
      unsubAuth();
    };
  }, [entity, load]);

  return { data: rows || [], loading: rows === null, refresh: load };
}
