import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a money amount in JOD (Jordanian Dinar — 3 decimal places / fils). */
export function formatJOD(amount: number | null | undefined, locale = "en"): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-JO", {
    style: "currency",
    currency: "JOD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

/** Customer-facing shop price: whole Jordanian dinars with the short "JD" code
 *  (Arabic: "د.أ"). The catalogue is priced in round dinars, and decimals like
 *  ".000"/".50" read as a software glitch to non-finance shoppers, so the price
 *  is rounded to the nearest whole JD for display (half rounds up). The
 *  accounting layer (formatJOD) keeps full 3-decimal fils precision and is
 *  unaffected by this. */
export function formatJODShop(amount: number | null | undefined, locale = "en"): string {
  const n = Math.round(Number(amount ?? 0));
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-JO", {
    maximumFractionDigits: 0,
  }).format(n);
  return locale === "ar" ? `${formatted} د.أ` : `${formatted} JD`;
}

/** Plain number with 3 decimals (no currency symbol). */
export function num3(amount: number | null | undefined): string {
  return Number(amount ?? 0).toFixed(3);
}

export const GST_RATE = 16; // Jordan General Sales Tax (%)

/** Round to 3 decimals (fils precision). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
