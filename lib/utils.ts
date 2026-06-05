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

/** Plain number with 3 decimals (no currency symbol). */
export function num3(amount: number | null | undefined): string {
  return Number(amount ?? 0).toFixed(3);
}

export const GST_RATE = 16; // Jordan General Sales Tax (%)

/** Round to 3 decimals (fils precision). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
