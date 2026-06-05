"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import {
  dictionaries,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type DictKey,
  type Locale,
} from "./dictionaries";

type I18nContextValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const setLocale = useCallback((l: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}`;
    // Reload so the server layout re-renders with the correct dir/lang.
    window.location.reload();
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
    return {
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      setLocale,
      t: (key, vars) => {
        let str: string = dict[key] ?? dictionaries.en[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`{${k}}`, "g"), String(v));
          }
        }
        return str;
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
