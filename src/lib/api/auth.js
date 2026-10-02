// Фасад аутентификации: localStorage (по умолчанию) или Supabase.
import { isSupabaseConfigured } from "@/lib/supabase/config";
import * as local from "@/lib/data/localAuth";
import * as cloud from "@/lib/supabase/auth";

const backend = isSupabaseConfigured ? cloud : local;

export const getCurrentUser = backend.getCurrentUser;
export const login = backend.login;
export const signup = backend.signup;
export const verifyOtp = backend.verifyOtp;
export const logout = backend.logout;
export const updateProfile = backend.updateProfile;
export const requestPasswordReset =
  backend.requestPasswordReset || ((email) => Promise.reject(new Error("NOT_SUPPORTED")));
export const resetPassword = backend.resetPassword;
export const changePassword = backend.changePassword;
export const listUsers = backend.listUsers;
export const updateUserRole = backend.updateUserRole;
export const updateUserPlan = backend.updateUserPlan;
export const getOrCreateInviteCode = backend.getOrCreateInviteCode;
export const inviteUser = backend.inviteUser || backend.createInvite;
export const ensureDemoAccount = backend.ensureDemoAccount || (() => false);
export const loginDemo = backend.loginDemo;
