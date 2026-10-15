import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { round3 } from "@/lib/utils";

export type InvestorReport = {
  from: string;
  to: string;
  kpis: {
    revenue: number;
    grossProfit: number;
    grossMargin: number; // %
    netProfit: number;
    netMargin: number; // %
    orders: number;
    avgOrder: number;
    unitsSold: number;
    customers: number;
  };
  pl: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    deliveryIncome: number;
    deliveryExpense: number;
    marketing: number;
    expenses: number;
    depreciation: number;
    netProfit: number;
  };
  position: {
    cash: number;
    courierReceivable: number;
    inventory: number;
    fixedAssets: number;
    otherAssets: number;
    totalAssets: number;
    gstPayable: number;
    vendorPayable: number;
    totalLiabilities: number;
    capital: number;
    retainedEarnings: number;
    drawings: number;
    totalEquity: number;
  };
  stock: { skus: number; units: number; atCost: number; atRetail: number };
  monthly: { month: string; orders: number; revenue: number; grossProfit: number }[];
  topProducts: { name: string; units: number; revenue: number }[];
  owners: { name: string; pct: number }[];
  /** Data problems the owner should fix before sharing (never printed). */
  warnings: string[];
};

const EXCLUDED = "(cancelled,returned)"; // same rule as get_financials

/** Restate every money amount at `rate` (1 JOD = rate units of the target currency). Counts and % are untouched. */
export function convertInvestorReport(r: InvestorReport, rate: number): InvestorReport {
  if (rate === 1) return r;
  const c = (v: number) => Math.round(v * rate * 100) / 100;
  const scale = <T extends Record<string, number>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, c(v)])) as T;
  return {
    ...r,
    kpis: {
      ...r.kpis,
      revenue: c(r.kpis.revenue),
      grossProfit: c(r.kpis.grossProfit),
      netProfit: c(r.kpis.netProfit),
      avgOrder: c(r.kpis.avgOrder),
    },
    pl: scale(r.pl),
    position: scale(r.position),
    stock: { ...r.stock, atCost: c(r.stock.atCost), atRetail: c(r.stock.atRetail) },
    monthly: r.monthly.map((m) => ({ ...m, revenue: c(m.revenue), grossProfit: c(m.grossProfit) })),
    topProducts: r.topProducts.map((p) => ({ ...p, revenue: c(p.revenue) })),
  };
}

type Fin = {
  pl: Record<string, number>;
  balance_sheet: Record<string, number>;
  partners: { name: string; pct: number }[];
  audits: { label: string; pass: boolean; detail: string }[];
};

const n = (v: unknown) => Number(v ?? 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** A business profile for a prospective partner/investor: performance + financial position for a period. */
export async function loadInvestorReport(
  supabase: SupabaseClient<Database>,
  from: string,
  to: string,
): Promise<InvestorReport> {
  const [finRes, salesRes, itemsRes, stockRes] = await Promise.all([
    supabase.rpc("get_financials", { p_from: from, p_to: to }),
    supabase
      .from("sales")
      .select("sale_date, subtotal, discount, gross_profit, customer_id")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .is("deleted_at", null)
      .not("status", "in", EXCLUDED)
      .range(0, 9999),
    supabase
      .from("sale_items")
      .select("product_id, description, qty, line_total, sales!inner(sale_date, status, deleted_at), products(name)")
      .gte("sales.sale_date", from)
      .lte("sales.sale_date", to)
      .is("sales.deleted_at", null)
      .not("sales.status", "in", EXCLUDED)
      .range(0, 19999),
    supabase
      .from("inventory")
      .select("qty_on_hand, avg_unit_cost, products!inner(default_selling_price, deleted_at)")
      .gt("qty_on_hand", 0)
      .is("products.deleted_at", null),
  ]);
  for (const r of [finRes, salesRes, itemsRes, stockRes]) if (r.error) throw r.error;

  const fin = finRes.data as unknown as Fin;
  const pl = fin.pl ?? {};
  const bs = fin.balance_sheet ?? {};
  const sales = salesRes.data ?? [];

  // Monthly trend
  const byMonth = new Map<string, { orders: number; revenue: number; grossProfit: number }>();
  const customers = new Set<string>();
  for (const s of sales) {
    const m = s.sale_date.slice(0, 7);
    const row = byMonth.get(m) ?? { orders: 0, revenue: 0, grossProfit: 0 };
    row.orders++;
    row.revenue += n(s.subtotal) - n(s.discount);
    row.grossProfit += n(s.gross_profit);
    byMonth.set(m, row);
    if (s.customer_id) customers.add(s.customer_id);
  }
  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, r]) => ({ month, orders: r.orders, revenue: round3(r.revenue), grossProfit: round3(r.grossProfit) }));

  // Best sellers
  let unitsSold = 0;
  const byProduct = new Map<string, { name: string; units: number; revenue: number }>();
  for (const it of itemsRes.data ?? []) {
    unitsSold += it.qty;
    const key = it.product_id ?? it.description ?? "—";
    const name = (it.products as { name: string } | null)?.name ?? it.description ?? "—";
    const row = byProduct.get(key) ?? { name, units: 0, revenue: 0 };
    row.units += it.qty;
    row.revenue += n(it.line_total);
    byProduct.set(key, row);
  }
  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((p) => ({ ...p, revenue: round3(p.revenue) }));

  // Stock on hand
  let skus = 0, units = 0, atCost = 0, atRetail = 0;
  for (const s of stockRes.data ?? []) {
    const price = n((s.products as { default_selling_price: number | null } | null)?.default_selling_price);
    skus++;
    units += s.qty_on_hand;
    atCost += s.qty_on_hand * n(s.avg_unit_cost);
    atRetail += s.qty_on_hand * price;
  }

  const revenue = n(pl.revenue);
  const grossProfit = n(pl.gross_profit);
  const netProfit = n(pl.net_profit);
  const orders = sales.length;

  const position = {
    cash: n(bs.cash),
    courierReceivable: n(bs.courier_receivable),
    inventory: n(bs.inventory) + n(bs.packaging_inventory),
    fixedAssets: n(bs.fixed_assets) + n(bs.equipment) - n(bs.accumulated_depreciation),
    otherAssets: 0,
    totalAssets: n(bs.total_assets),
    gstPayable: n(bs.gst_payable),
    vendorPayable: n(bs.vendor_payable),
    totalLiabilities: n(bs.total_liabilities),
    capital: n(bs.contributed_capital) + n(bs.opening_capital),
    retainedEarnings: n(bs.retained_earnings),
    drawings: n(bs.drawings),
    totalEquity: n(bs.total_equity),
  };
  // Whatever the named lines don't explain (keeps the printed column adding up to total assets).
  position.otherAssets = round3(
    position.totalAssets - position.cash - position.courierReceivable - position.inventory - position.fixedAssets,
  );

  const warnings: string[] = [];
  if (position.cash < 0)
    warnings.push("Cash is negative — usually capital put into the business was never recorded (Banks → add a Capital entry).");
  if (position.totalEquity < 0) warnings.push("Total equity is negative.");
  if (monthly.length === 1 && orders > 0 && from.slice(0, 7) !== to.slice(0, 7))
    warnings.push(`All ${orders} sales in this period are dated ${monthly[0].month} — check that sales were entered with their real dates.`);
  for (const a of fin.audits ?? []) if (!a.pass) warnings.push(`Audit check failed: ${a.label}${a.detail ? ` — ${a.detail}` : ""}`);

  return {
    from,
    to,
    kpis: {
      revenue,
      grossProfit,
      grossMargin: pct(grossProfit, revenue),
      netProfit,
      netMargin: pct(netProfit, revenue),
      orders,
      avgOrder: orders ? round3(revenue / orders) : 0,
      unitsSold,
      customers: customers.size,
    },
    pl: {
      revenue,
      cogs: n(pl.cogs),
      grossProfit,
      deliveryIncome: n(pl.delivery_income),
      deliveryExpense: n(pl.delivery_expense),
      marketing: n(pl.marketing),
      expenses: n(pl.expenses),
      depreciation: n(pl.depreciation),
      netProfit,
    },
    position,
    stock: { skus, units, atCost: round3(atCost), atRetail: round3(atRetail) },
    monthly,
    topProducts,
    owners: (fin.partners ?? []).map((p) => ({ name: p.name, pct: n(p.pct) })),
    warnings,
  };
}
