/**
 * Live FX rate lookup. Configure the provider in `.env.local`:
 *
 *   NEXT_PUBLIC_FX_API_URL=https://open.er-api.com/v6/latest
 *   NEXT_PUBLIC_FX_API_KEY=               # optional, sent as ?api_key=…
 *
 * The default (open.er-api.com) is CORS-friendly, free, and requires no key.
 * The fetcher appends `/<FROM>` to the base URL — so it works with any
 * provider that returns rates for one base currency at a path like
 * `https://example.com/v6/latest/USD`. Response must include
 * `{ rates: { [TO]: number } }`.
 *
 * Returns the rate of 1 unit of `from` expressed in `to` currency.
 */

/** Currencies we expose in the Purchase wizard dropdown. */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "INR", name: "Indian Rupee" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "JOD", name: "Jordanian Dinar" },
];

export type FxResult = { rate: number; source: string; asOf?: string };

const FX_URL = process.env.NEXT_PUBLIC_FX_API_URL || "https://open.er-api.com/v6/latest";
const FX_KEY = process.env.NEXT_PUBLIC_FX_API_KEY || "";

export async function fetchFxRate(from: string, to: string): Promise<FxResult> {
  const F = from.trim().toUpperCase();
  const T = to.trim().toUpperCase();
  if (!F || !T) throw new Error("Both currencies are required");
  if (F === T) return { rate: 1, source: "identity" };

  // open.er-api.com / exchangerate-api.com style:
  //   GET /v6/latest/USD  → { result, base_code, rates: { JOD: 0.71, ... }, time_last_update_utc }
  // Most providers in this family support the same path pattern.
  const base = FX_URL.replace(/\/$/, "");
  const url = new URL(`${base}/${F}`);
  if (FX_KEY) url.searchParams.set("api_key", FX_KEY);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`FX provider returned ${res.status}`);
  const data = (await res.json()) as {
    rates?: Record<string, number>;
    result?: string;
    time_last_update_utc?: string;
    date?: string;
  };
  if (data.result && data.result !== "success") {
    throw new Error("FX provider returned an error");
  }
  const rate = data.rates?.[T];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX provider did not return a usable rate for ${T}`);
  }
  // Normalise the as-of date.
  const asOf = data.date || (data.time_last_update_utc ? data.time_last_update_utc.slice(5, 16) : undefined);
  return { rate, source: FX_URL, asOf };
}
