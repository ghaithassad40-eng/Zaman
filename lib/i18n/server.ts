import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./dictionaries";

/** Read the active locale from the cookie (server-side). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return value === "ar" || value === "en" ? value : DEFAULT_LOCALE;
}
