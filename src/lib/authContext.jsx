import React, { createContext, useContext, useState, useEffect } from "react";
import * as authApi from "@/lib/api/auth";
import { subscribe } from "@/lib/api/db";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authApi.getCurrentUser());

  useEffect(() => {
    const unsub = subscribe("auth", () => setUser(authApi.getCurrentUser()));
    return unsub;
  }, []);

  const login = (email, password) => {
    const u = authApi.login(email, password);
    setUser(u);
    return u;
  };

  const signup = (data) => authApi.signup(data);

  const verifyOtp = (email, otp) => {
    const u = authApi.verifyOtp(email, otp);
    setUser(u);
    return u;
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  const updateProfile = (userId, data) => {
    const u = authApi.updateProfile(userId, data);
    setUser((prev) => (prev && prev.id === u.id ? u : prev));
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
