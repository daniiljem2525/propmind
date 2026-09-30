import React, { createContext, useContext, useState, useEffect } from "react";
import * as authApi from "@/lib/api/auth";
import { subscribe } from "@/lib/api/db";

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
        .then((u) => alive && setUser(u ?? null))
        .catch(() => alive && setUser(null));
    load();
    const unsub = subscribe("auth", load);
    // Страховка: если сессия не определилась за 8 секунд (медленная сеть,
    // подвисший SDK, битый storage) — считаем гостем, а не вечной загрузкой
    const fallback = setTimeout(() => {
      if (alive) setUser((u) => (u === undefined ? null : u));
    }, 8000);
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
        inviteUser: authApi.inviteUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
