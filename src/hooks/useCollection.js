import { useEffect, useState, useCallback } from "react";
import { subscribe } from "@/lib/api/db";
import { isDemoMode, subscribeDemoMode } from "@/lib/demoMode";
import { useAuth } from "@/lib/authContext";

// Кэш коллекций между страницами: возврат на страницу отдаёт прошлые
// данные мгновенно (без «лагов» и спиннеров), фоновый запрос обновляет.
// Ключ — коллекция + пользователь + демо-режим, чтобы слои не смешивались.
const cache = new Map();
const cacheKey = (collection, userId) =>
  `${collection}|${userId || "anon"}|${isDemoMode() ? "demo" : "real"}`;

// useCollection(Entity) — данные + realtime-обновление при любых мутациях
// (в этой вкладке и в соседних), при смене пользователя и демо-режима.
export function useCollection(entity) {
  const { user } = useAuth();
  const [rows, setRows] = useState(() => cache.get(cacheKey(entity.collection, user?.id)) ?? null);

  const load = useCallback(() => {
    entity
      .list()
      .then((list) => {
        cache.set(cacheKey(entity.collection, user?.id), list);
        setRows(list);
      })
      .catch(() => setRows([]));
  }, [entity, user?.id]);

  useEffect(() => {
    load();
    const unsubData = subscribe(entity.collection, load);
    const unsubAuth = subscribe("auth", load);
    const unsubDemo = subscribeDemoMode(load);
    return () => {
      unsubData();
      unsubAuth();
      unsubDemo();
    };
  }, [entity, load]);

  return { data: rows || [], loading: rows === null, refresh: load };
}
