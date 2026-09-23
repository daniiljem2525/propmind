import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { ru } from "./ru";
import { en } from "./en";

const LangContext = createContext(null);
const KEY = "propmind:lang";

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "ru";
    } catch {
      return "ru";
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l) => {
    try {
      localStorage.setItem(KEY, l);
    } catch {}
    setLangState(l);
  }, []);

  const t = useCallback((key) => {
    const dict = lang === "ru" ? ru : en;
    return dict[key] ?? key;
  }, [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
