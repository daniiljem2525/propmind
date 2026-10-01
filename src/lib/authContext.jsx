import React, { createContext, useContext, useState, useEffect } from "react";
import * as authApi from "@/lib/api/auth";
import { subscribe } from "@/lib/api/db";
import { probeSessionStores } from "@/lib/supabase/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = профиль ещё загружается, null = гость, объект = залогинен.
  // В облаке getCurrentUser асинхронный: если положить в состояние сам
  // Promise (truthy!), приложение считает пользователя залогиненным,
  // а role/id у такого "пользователя" — undefined.
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.resolve(authApi.getCurrentUser())
        .then(async (u) => {
          if (!alive) return;
          if (u) return setUser(u);
          // null: сессии нет вовсе — или сеть при холодном старте не успела
          // обновить токен. Данные сессии в хранилище есть → это второе:
          // даём сети подняться и пробуем ещё, прежде чем показать вход.
          let stored = 0;
          try {
            const probe = await probeSessionStores();
            stored = probe.ls + probe.ck + probe.idb;
          } catch {}
          if (!stored) return setUser(null);
          for (let attempt = 0; attempt < 3 && alive; attempt++) {
            await new Promise((r) => setTimeout(r, 2500));
            if (!alive) return;
            try {
              const retry = await authApi.getCurrentUser();
              if (retry && alive) return setUser(retry);
            } catch {}
          }
          if (alive) setUser(null);
        })
        .catch(() => alive && setUser(null));
    load();
    const unsub = subscribe("auth", load);
    // Страховка: если сессия не определилась за 12 секунд (медленная сеть,
    // подвисший SDK, битый storage) — считаем гостем, а не вечной загрузкой
    const fallback = setTimeout(() => {
      if (alive) setUser((u) => (u === undefined ? null : u));
    }, 12000);
    return () => {
      alive = false;
      clearTimeout(fallback);
      unsub();
    };
  }, []);

  const login = async (email, password) => {
    const u = await authApi.login(email, password);
    setUser(u);
    return u;
  };

  const signup = async (data) => authApi.signup(data);

  const verifyOtp = (email, otp) =>
    Promise.resolve(authApi.verifyOtp(email, otp)).then((u) => {
      setUser(u ?? null);
      return u;
    });

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  const updateProfile = async (userId, data) => {
    const u = await authApi.updateProfile(userId, data);
    setUser((prev) => (prev && prev.id === u?.id ? u : prev));
    return u;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        verifyOtp,
        logout,
        updateProfile,
        requestPasswordReset: authApi.requestPasswordReset,
        resetPassword: authApi.resetPassword,
        changePassword: authApi.changePassword,
        listUsers: authApi.listUsers,
        updateUserRole: authApi.updateUserRole,
        updateUserPlan: authApi.updateUserPlan,
        inviteUser: authApi.inviteUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
