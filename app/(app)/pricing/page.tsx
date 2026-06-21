"use client";

/**
 * Pricing Advisor
 * ────────────────
 *
 * Helps the operator price products correctly. Three concerns, on one page:
 *
 *  1. **Strategy picker** — choose a pricing method (cost-plus markup, target
 *     margin, keystone 2×, market match) and parameters (markup %, GST on/off,
 *     psychological rounding). The page recomputes a suggested price for every
 *     active product live; nothing is saved until the operator clicks Apply.
 *
 *  2. **Health summary** — at-a-glance read of how the current price book is
 *     doing: number of products below cost, average gross margin, products
 *     with no price set, products priced under target.
 *
 *  3. **Per-product table** — for every active product, the current price,
 *     unit cost, current gross margin, and the suggested price under the
 *     chosen strategy. A single Apply button writes the suggested price to
 *     `default_selling_price`; a "Apply all" header button bulk-applies every
 *     unwritten row.
 *
 * The visible formula is intentional. The card on top walks the operator
 * through Unit cost → markup/margin → GST → rounding so they understand
 * where the suggested number came from, not just that "the app said so".
 *
 * Money math here stays in 3-decimal fils precision (`round3`) to match the
 * accounting layer; the table renders the JOD with the standard helper.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Percent,
  Save,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCompanySettings } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatJOD, round3 } from "@/lib/utils";
import { useSort, SortableHead } from "@/components/ui/sortable-head";
import { ProductCell } from "@/components/product-cell";

type Row = {
  id: string;
  name: string;
  brand: string | null;
  color: string | null;
  watch_type: string | null;
  image_urls: string[] | null;
  qty_on_hand: number;
  avg_unit_cost: number;
  default_selling_price: number;
  expected_selling_price: number | null;
};

type Method = "markup" | "margin" | "keystone" | "anchor";
type Rounding = "none" | "round5" | "endsIn99" | "endsIn95" | "wholeJod";

/** Reference price bands for the Jordan retail market, in JOD per item.
 *  These are sensible defaults drawn from the local watch reseller scene
 *  (Shein-style imports → markup); the operator can override them inline.
 *  A suggested price below `low` flags "underpriced for the market"; above
 *  `high` flags "above market" (risk of stalling). The middle band is the
 *  typical sweet spot Jordanian customers pay without negotiating. */
const JORDAN_BANDS_DEFAULT: Record<string, { low: number; high: number }> = {
  battery: { low: 8, high: 25 },
  digital: { low: 10, high: 30 },
  smartwatch: { low: 15, high: 50 },
  automatic: { low: 25, high: 80 },
  other: { low: 10, high: 40 },
  accessories: { low: 3, high: 30 },
  unknown: { low: 10, high: 40 },
};

const DEFAULTS = {
  method: "margin" as Method,
  markupPct: 100, // cost-plus markup
  marginPct: 50, // gross margin target
  anchorPrice: 0, // for "match the market" — single price target
  includeGst: false, // GST already part of customer-facing selling price?
  rounding: "wholeJod" as Rounding,
};

export default function PricingPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: settings } = useCompanySettings();
  const gstRate = Number(settings?.gst_rate ?? 16);

  const [method, setMethod] = useState<Method>(DEFAULTS.method);
  const [markupPct, setMarkupPct] = useState(DEFAULTS.markupPct);
  const [marginPct, setMarginPct] = useState(DEFAULTS.marginPct);
  const [anchorPrice, setAnchorPrice] = useState(DEFAULTS.anchorPrice);
  const [includeGst, setIncludeGst] = useState(DEFAULTS.includeGst);
  const [rounding, setRounding] = useState<Rounding>(DEFAULTS.rounding);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-row manual price entry (keyed by product id). Empty = use the suggested
  // price. Lets the operator type any price instead of accepting the strategy's
  // suggestion, while "Keep current" applies the existing price as-is.
  const [manual, setManual] = useState<Record<string, string>>({});

  // ── Overhead inputs (the big idea of v2) ─────────────────────────────────
  // Each watch has to absorb a slice of the monthly fixed costs (assets
  // depreciating + marketing spend) plus the per-order packaging gift items.
  // We seed values from real DB rolling-90d averages and let the operator
  // override anything inline. Per-unit overhead = monthly fixed costs ÷
  // expected monthly units sold.
  const [overheadOn, setOverheadOn] = useState(true);
  const [packagingPerUnit, setPackagingPerUnit] = useState<number | null>(null);
  const [monthlyDepreciation, setMonthlyDepreciation] = useState<number | null>(null);
  const [monthlyMarketing, setMonthlyMarketing] = useState<number | null>(null);
  const [expectedMonthlyUnits, setExpectedMonthlyUnits] = useState<number | null>(null);
  const [marketCheckOn, setMarketCheckOn] = useState(true);
  // User-editable market bands per type (default from JORDAN_BANDS_DEFAULT).
  const [bands, setBands] = useState<Record<string, { low: number; high: number }>>(JORDAN_BANDS_DEFAULT);

  /** Pull cost-basis seeds: monthly depreciation, 90-day marketing average,
   *  90-day units-sold average. These feed the overhead inputs above as
   *  initial values — the operator can override any of them. */
  const { data: costBasis } = useQuery({
    queryKey: ["pricing-cost-basis"],
    queryFn: async () => {
      const [assetsRes, mktRes, unitsRes] = await Promise.all([
        supabase.from("v_assets").select("monthly_depreciation"),
        supabase
          .from("cash_transactions")
          .select("amount, txn_date, category, direction")
          .eq("direction", "out")
          .in("category", ["marketing", "ads"]),
        supabase
          .from("sale_items")
          .select("qty, sales(sale_date, status, deleted_at)")
          .not("sales", "is", null),
      ]);
      const monthlyDep = (assetsRes.data ?? []).reduce(
        (s, r) => s + Number(r.monthly_depreciation ?? 0),
        0,
      );
      // 90-day rolling average of marketing spend, expressed monthly.
      const ninetyAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const mktSum = (mktRes.data ?? [])
        .filter((r) => (r.txn_date ?? "") >= ninetyAgo)
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const monthlyMkt = mktSum / 3;
      // 90-day units sold (real sales only) → monthly average.
      const unitsSum = (unitsRes.data ?? [])
        .filter((r) => {
          const s = r.sales as { sale_date?: string; status?: string; deleted_at?: string | null } | null;
          if (!s || s.deleted_at) return false;
          if (s.status === "cancelled" || s.status === "returned") return false;
          return (s.sale_date ?? "") >= ninetyAgo;
        })
        .reduce((s, r) => s + Number(r.qty ?? 0), 0);
      const monthlyUnits = unitsSum / 3;
      return {
        monthlyDep: round3(monthlyDep),
        monthlyMkt: round3(monthlyMkt),
        monthlyUnits: Math.max(1, Math.round(monthlyUnits)),
      };
    },
  });

  // Once the seed query returns, set the inputs (the user can still override).
  useMemo(() => {
    if (!costBasis) return;
    if (monthlyDepreciation == null) setMonthlyDepreciation(costBasis.monthlyDep);
    if (monthlyMarketing == null) setMonthlyMarketing(costBasis.monthlyMkt);
    // Default to a sensible floor of 30 units/month when there is no history.
    if (expectedMonthlyUnits == null)
      setExpectedMonthlyUnits(Math.max(30, costBasis.monthlyUnits));
    if (packagingPerUnit == null)
      setPackagingPerUnit(Number(settings?.packaging_cost_per_order ?? 0));
    // We only want to seed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costBasis, settings?.packaging_cost_per_order]);

  /** Per-unit overhead = (monthly depreciation + monthly marketing) ÷
   *  expected monthly units. Returns 0 if overhead is disabled or the user
   *  hasn't picked an expected-units number. */
  const overheadPerUnit = useMemo(() => {
    if (!overheadOn) return 0;
    const units = Math.max(1, expectedMonthlyUnits ?? 0);
    const dep = monthlyDepreciation ?? 0;
    const mkt = monthlyMarketing ?? 0;
    return round3((dep + mkt) / units);
  }, [overheadOn, expectedMonthlyUnits, monthlyDepreciation, monthlyMarketing]);

  /** Effective per-unit cost the operator should price ABOVE to make money.
   *  Wraps the raw inventory cost with packaging gift items + the
   *  proportional overhead slice computed above. */
  function trueCost(unitCost: number): number {
    return round3(unitCost + (packagingPerUnit ?? 0) + overheadPerUnit);
  }

  const { data: rows, isLoading } = useQuery({
    queryKey: ["pricing-rows"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, brand, color, watch_type, image_urls, default_selling_price, expected_selling_price, inventory(qty_on_hand, avg_unit_cost)",
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => {
        const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
        return {
          id: p.id,
          name: p.name,
          brand: p.brand ?? null,
          color: p.color ?? null,
          watch_type: (p.watch_type as string | null) ?? null,
          image_urls: (p.image_urls as string[] | null) ?? null,
          qty_on_hand: Number(inv?.qty_on_hand ?? 0),
          avg_unit_cost: Number(inv?.avg_unit_cost ?? 0),
          default_selling_price: Number(p.default_selling_price ?? 0),
          expected_selling_price: p.expected_selling_price == null
            ? null
            : Number(p.expected_selling_price),
        };
      });
    },
  });

  /** Suggested selling price for one product under the current strategy.
   *  `cost` here is the TRUE landed cost (raw unit + packaging + overhead),
   *  not just inventory cost. Returns 0 when there is no cost basis and no
   *  anchor — the operator hasn't given enough information for a recommendation. */
  function suggest(cost: number): number {
    if (cost <= 0 && method !== "anchor") return 0;
    let p = 0;
    switch (method) {
      case "markup":
        p = cost * (1 + markupPct / 100);
        break;
      case "margin": {
        // gross margin% = (price − cost) / price → price = cost / (1 − m)
        const m = Math.min(0.95, Math.max(0, marginPct / 100));
        p = m >= 1 ? cost * 2 : cost / (1 - m);
        break;
      }
      case "keystone":
        p = cost * 2; // classic retail
        break;
      case "anchor":
        p = anchorPrice;
        break;
    }
    if (includeGst && gstRate > 0) p = p * (1 + gstRate / 100);
    // Rounding to a customer-friendly endpoint.
    switch (rounding) {
      case "round5":
        p = Math.round(p * 2) / 2; // nearest .5 JOD
        break;
      case "endsIn99": {
        const whole = Math.max(0, Math.floor(p));
        p = whole + 0.99;
        break;
      }
      case "endsIn95": {
        const whole = Math.max(0, Math.floor(p));
        p = whole + 0.95;
        break;
      }
      case "wholeJod":
        p = Math.round(p);
        break;
      case "none":
      default:
        break;
    }
    return round3(p);
  }

  const enriched = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const landed = trueCost(r.avg_unit_cost);
      const suggested = suggest(landed);
      const current = r.default_selling_price || r.expected_selling_price || 0;
      // gross margin% is now measured against TRUE landed cost (includes
      // packaging + overhead share), not just the raw inventory cost. This
      // is how the operator actually makes money.
      const currentMargin =
        current > 0 && landed > 0
          ? ((current - landed) / current) * 100
          : current > 0
          ? 100
          : null;
      const suggestedMargin =
        suggested > 0 && landed > 0
          ? ((suggested - landed) / suggested) * 100
          : null;
      // Jordan market band lookup. Falls back to "unknown" defaults so a
      // product with no watch_type still gets a sanity check.
      const bandKey = (r.watch_type ?? "unknown") as keyof typeof bands;
      const band = bands[bandKey] ?? bands.unknown;
      const marketPos: "below" | "in" | "above" =
        !marketCheckOn || suggested <= 0
          ? "in"
          : suggested < band.low
          ? "below"
          : suggested > band.high
          ? "above"
          : "in";
      return {
        ...r,
        landed,
        current,
        currentMargin,
        suggested,
        suggestedMargin,
        delta: suggested - current,
        belowCost: current > 0 && current < landed,
        noPrice: current === 0,
        marketBand: band,
        marketPos,
      };
    });
  }, [rows, method, markupPct, marginPct, anchorPrice, includeGst, rounding, gstRate, overheadPerUnit, packagingPerUnit, bands, marketCheckOn]);

  // ── Health summary ───────────────────────────────────────────────────────
  const health = useMemo(() => {
    if (!enriched.length) return null;
    const below = enriched.filter((r) => r.belowCost).length;
    const noPrice = enriched.filter((r) => r.noPrice).length;
    const withMargin = enriched.filter((r) => r.currentMargin != null);
    const avgMargin =
      withMargin.length > 0
        ? withMargin.reduce((s, r) => s + (r.currentMargin ?? 0), 0) /
          withMargin.length
        : 0;
    const underTarget = enriched.filter(
      (r) => r.currentMargin != null && r.currentMargin < marginPct,
    ).length;
    return { below, noPrice, avgMargin, underTarget, total: enriched.length };
  }, [enriched, marginPct]);

  // ── Sortable table ──────────────────────────────────────────────────────
  const sort = useSort<typeof enriched[number]>("name", "asc");
  const sortedRows = useMemo(
    () =>
      sort.applyTo(enriched, (r, key) => {
        switch (key) {
          case "name": return r.name;
          case "cost": return r.avg_unit_cost;
          case "landed": return r.landed;
          case "current": return r.current;
          case "currentMargin": return r.currentMargin;
          case "suggested": return r.suggested;
          case "delta": return r.delta;
          default: return null;
        }
      }),
    [enriched, sort],
  );

  const applyOne = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      setBusy(id);
      const { error } = await supabase
        .from("products")
        .update({ default_selling_price: price })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("pricing.appliedOne"));
      qc.invalidateQueries({ queryKey: ["pricing-rows"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(null),
  });

  const applyAll = useMutation({
    mutationFn: async () => {
      const eligible = enriched.filter(
        (r) => r.suggested > 0 && r.suggested !== r.current,
      );
      // Batch updates one at a time; the API doesn't have an UPSERT array form
      // for partial updates without conflict resolution.
      for (const r of eligible) {
        const { error } = await supabase
          .from("products")
          .update({ default_selling_price: r.suggested })
          .eq("id", r.id);
        if (error) throw error;
      }
      return eligible.length;
    },
    onSuccess: (n) => {
      toast.success(t("pricing.appliedAll").replace("{n}", String(n)));
      qc.invalidateQueries({ queryKey: ["pricing-rows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Pick a sample product for the live formula breakdown card.
  const sample = enriched.find((r) => r.avg_unit_cost > 0) ?? enriched[0];

  return (
    <>
      <PageHeader title={t("pricing.title")} description={t("pricing.subtitle")} />

      {/* ── How the price is built ─────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" /> {t("pricing.formulaTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FormulaExplainer
            sample={sample}
            method={method}
            markupPct={markupPct}
            marginPct={marginPct}
            anchorPrice={anchorPrice}
            includeGst={includeGst}
            gstRate={gstRate}
            rounding={rounding}
            suggest={suggest}
            locale={locale}
            t={t}
            packagingPerUnit={packagingPerUnit ?? 0}
            overheadPerUnit={overheadPerUnit}
          />
        </CardContent>
      </Card>

      {/* ── Health snapshot ─────────────────────────────────────────────── */}
      {health && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            tone={health.below > 0 ? "danger" : "ok"}
            icon={<AlertTriangle className="size-4" />}
            label={t("pricing.kpiBelowCost")}
            value={`${health.below}/${health.total}`}
            hint={t("pricing.kpiBelowCostHint")}
          />
          <KpiCard
            tone={health.noPrice > 0 ? "warn" : "ok"}
            icon={<Sparkles className="size-4" />}
            label={t("pricing.kpiNoPrice")}
            value={`${health.noPrice}/${health.total}`}
            hint={t("pricing.kpiNoPriceHint")}
          />
          <KpiCard
            tone={health.avgMargin < 30 ? "warn" : "ok"}
            icon={<Percent className="size-4" />}
            label={t("pricing.kpiAvgMargin")}
            value={`${health.avgMargin.toFixed(1)}%`}
            hint={t("pricing.kpiAvgMarginHint")}
          />
          <KpiCard
            tone={health.underTarget > 0 ? "warn" : "ok"}
            icon={<TrendingUp className="size-4" />}
            label={t("pricing.kpiUnderTarget").replace("{n}", String(marginPct))}
            value={`${health.underTarget}/${health.total}`}
            hint={t("pricing.kpiUnderTargetHint")}
          />
        </div>
      )}

      {/* ── Cost stack inputs (the v2 idea) ────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("pricing.overheadTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            <Info className="size-4 shrink-0" aria-hidden />
            <p>{t("pricing.overheadHint")}</p>
          </div>
          <label className="mb-4 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={overheadOn}
              onChange={(e) => setOverheadOn(e.target.checked)}
            />
            {t("pricing.factorOverhead")}
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("pricing.packagingPerUnit")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} step="0.001" dir="ltr"
                  value={packagingPerUnit ?? 0}
                  onChange={(e) => setPackagingPerUnit(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!overheadOn}
                />
                <span className="text-xs text-muted-foreground">JOD</span>
              </div>
            </Field>
            <Field label={t("pricing.monthlyDep")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} step="0.001" dir="ltr"
                  value={monthlyDepreciation ?? 0}
                  onChange={(e) => setMonthlyDepreciation(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!overheadOn}
                />
                <span className="text-xs text-muted-foreground">JOD/mo</span>
              </div>
            </Field>
            <Field label={t("pricing.monthlyMkt")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} step="0.001" dir="ltr"
                  value={monthlyMarketing ?? 0}
                  onChange={(e) => setMonthlyMarketing(Math.max(0, Number(e.target.value) || 0))}
                  disabled={!overheadOn}
                />
                <span className="text-xs text-muted-foreground">JOD/mo</span>
              </div>
            </Field>
            <Field label={t("pricing.expectedUnits")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} step={1} dir="ltr"
                  value={expectedMonthlyUnits ?? 30}
                  onChange={(e) => setExpectedMonthlyUnits(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                  disabled={!overheadOn}
                />
                <span className="text-xs text-muted-foreground">units/mo</span>
              </div>
            </Field>
          </div>
          <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-semibold">{t("pricing.overheadOutcome")}</div>
            <div className="mt-1 text-muted-foreground">
              {t("pricing.overheadFormula")
                .replace("{dep}", (monthlyDepreciation ?? 0).toFixed(3))
                .replace("{mkt}", (monthlyMarketing ?? 0).toFixed(3))
                .replace("{units}", String(expectedMonthlyUnits ?? 0))}
            </div>
            <div className="mt-2 text-base font-semibold text-primary">
              {t("pricing.overheadPerUnit")}: {formatJOD(overheadPerUnit, locale)}
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                + {formatJOD(packagingPerUnit ?? 0, locale)} {t("pricing.packagingNote")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Jordan market reference ─────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t("pricing.marketTitle")}</span>
            <label className="inline-flex items-center gap-2 text-xs font-normal">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={marketCheckOn}
                onChange={(e) => setMarketCheckOn(e.target.checked)}
              />
              {t("pricing.marketCheckOn")}
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">{t("pricing.marketHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(["battery","digital","smartwatch","automatic","other","accessories"] as const).map((k) => (
              <div key={k} className="rounded-md border p-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">{t(`shop.${k}` as never)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number" min={0} step={1} dir="ltr"
                    value={bands[k].low}
                    onChange={(e) => setBands({ ...bands, [k]: { ...bands[k], low: Math.max(0, Number(e.target.value) || 0) } })}
                    className="h-7 w-16 px-2 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input
                    type="number" min={0} step={1} dir="ltr"
                    value={bands[k].high}
                    onChange={(e) => setBands({ ...bands, [k]: { ...bands[k], high: Math.max(0, Number(e.target.value) || 0) } })}
                    className="h-7 w-16 px-2 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Strategy controls ──────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("pricing.strategyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("pricing.method")}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="margin">{t("pricing.methodMargin")}</option>
              <option value="markup">{t("pricing.methodMarkup")}</option>
              <option value="keystone">{t("pricing.methodKeystone")}</option>
              <option value="anchor">{t("pricing.methodAnchor")}</option>
            </Select>
          </Field>
          {method === "margin" && (
            <Field label={t("pricing.targetMargin")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={95} step={1} dir="ltr"
                  value={marginPct}
                  onChange={(e) => setMarginPct(Math.min(95, Math.max(0, Number(e.target.value) || 0)))}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          )}
          {method === "markup" && (
            <Field label={t("pricing.markup")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} step={5} dir="ltr"
                  value={markupPct}
                  onChange={(e) => setMarkupPct(Math.max(0, Number(e.target.value) || 0))}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          )}
          {method === "anchor" && (
            <Field label={t("pricing.anchorPrice")}>
              <Input
                type="number" min={0} step="0.001" dir="ltr"
                value={anchorPrice}
                onChange={(e) => setAnchorPrice(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          )}
          <Field label={t("pricing.rounding")}>
            <Select value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)}>
              <option value="wholeJod">{t("pricing.roundWhole")}</option>
              <option value="round5">{t("pricing.roundHalf")}</option>
              <option value="endsIn99">{t("pricing.endsIn99")}</option>
              <option value="endsIn95">{t("pricing.endsIn95")}</option>
              <option value="none">{t("pricing.roundNone")}</option>
            </Select>
          </Field>
          <Field label={t("pricing.gstHandling")}>
            <label className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={includeGst}
                onChange={(e) => setIncludeGst(e.target.checked)}
              />
              {t("pricing.addGst").replace("{p}", String(gstRate))}
            </label>
          </Field>
        </CardContent>
      </Card>

      {/* ── Bulk discount ──────────────────────────────────────────────── */}
      <BulkDiscount />

      {/* ── Per-product table ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("pricing.tableTitle")}</CardTitle>
          <Button
            size="sm"
            onClick={() => applyAll.mutate()}
            disabled={applyAll.isPending || isLoading}
          >
            {applyAll.isPending && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" /> {t("pricing.applyAll")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead sortKey="name" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>
                      {t("common.name")}
                    </SortableHead>
                    <SortableHead sortKey="cost" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">
                      {t("pricing.cost")}
                    </SortableHead>
                    <SortableHead sortKey="landed" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">
                      {t("pricing.trueCost")}
                    </SortableHead>
                    <SortableHead sortKey="current" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">
                      {t("pricing.currentPrice")}
                    </SortableHead>
                    <SortableHead sortKey="currentMargin" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">
                      {t("pricing.gp")}
                    </SortableHead>
                    <SortableHead sortKey="suggested" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">
                      {t("pricing.suggested")}
                    </SortableHead>
                    <SortableHead sortKey="delta" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle} align="end">
                      Δ
                    </SortableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((r) => {
                    // What's currently saved on the product.
                    const stored = round3(r.default_selling_price);
                    // The editable price field: the operator's typed value if they
                    // touched it, otherwise the strategy's suggestion.
                    const entered = manual[r.id] ?? (r.suggested > 0 ? String(r.suggested) : "");
                    const enteredNum = round3(Number(entered) || 0);
                    // Already saved at the entered value → nothing to apply.
                    const atStored = enteredNum > 0 && enteredNum === stored;
                    const canApplyEntered = enteredNum > 0 && !atStored && busy !== r.id;
                    // "Keep current" only does something when the shown current price
                    // (which may come from expected_selling_price) isn't saved yet.
                    const canKeepCurrent = r.current > 0 && round3(r.current) !== stored && busy !== r.id;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <ProductCell
                            image={r.image_urls?.[0]}
                            name={r.name}
                            meta={
                              <>
                                <span>{[r.brand, r.color].filter(Boolean).join(" · ")}</span>
                                <span className="ms-2 inline-flex flex-wrap gap-1 align-middle">
                                  {r.belowCost && (
                                    <Badge variant="destructive" className="text-[10px]">
                                      {t("pricing.flagBelowCost")}
                                    </Badge>
                                  )}
                                  {r.noPrice && (
                                    <Badge variant="warning" className="text-[10px]">
                                      {t("pricing.flagNoPrice")}
                                    </Badge>
                                  )}
                                  {r.currentMargin != null &&
                                    !r.belowCost &&
                                    r.currentMargin < marginPct && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {t("pricing.flagUnderTarget")}
                                      </Badge>
                                    )}
                                </span>
                              </>
                            }
                          />
                        </TableCell>
                        <TableCell className="text-end">{formatJOD(r.avg_unit_cost, locale)}</TableCell>
                        <TableCell className="text-end text-muted-foreground" title={t("pricing.trueCostHint")}>
                          {formatJOD(r.landed, locale)}
                        </TableCell>
                        <TableCell className="text-end">
                          {r.current > 0 ? formatJOD(r.current, locale) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-end">
                          {r.currentMargin == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={r.currentMargin < 0 ? "text-destructive" : r.currentMargin < 30 ? "text-amber-700" : "text-success"}>
                              {r.currentMargin.toFixed(1)}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-end font-medium text-primary">
                          {r.suggested > 0 ? formatJOD(r.suggested, locale) : <span className="text-muted-foreground">—</span>}
                          {marketCheckOn && r.suggested > 0 && (
                            <div className="mt-0.5">
                              {r.marketPos === "above" && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {t("pricing.flagAboveMarket")} ({r.marketBand.low}–{r.marketBand.high})
                                </Badge>
                              )}
                              {r.marketPos === "below" && (
                                <Badge variant="warning" className="text-[10px]">
                                  {t("pricing.flagBelowMarket")} ({r.marketBand.low}–{r.marketBand.high})
                                </Badge>
                              )}
                              {r.marketPos === "in" && r.watch_type && (
                                <Badge variant="success" className="text-[10px]">
                                  {t("pricing.flagInMarket")}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          {r.suggested > 0 && r.current > 0 ? (
                            <span className={r.delta >= 0 ? "text-success" : "text-destructive"}>
                              {r.delta > 0 ? "+" : ""}{r.delta.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number" min={0} step="0.001" dir="ltr"
                              value={entered}
                              onChange={(e) => setManual({ ...manual, [r.id]: e.target.value })}
                              placeholder={t("pricing.manualPlaceholder")}
                              aria-label={t("pricing.manualPlaceholder")}
                              disabled={busy === r.id}
                              className="h-8 w-20 px-2 text-end text-xs"
                            />
                            <Button
                              size="sm"
                              variant={atStored ? "outline" : "default"}
                              disabled={!canApplyEntered}
                              onClick={() => applyOne.mutate({ id: r.id, price: enteredNum })}
                              title={t("pricing.applyManual")}
                            >
                              {busy === r.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : atStored ? (
                                <CheckCircle2 className="size-3" />
                              ) : (
                                <Save className="size-3" />
                              )}
                              {atStored ? t("pricing.upToDate") : t("pricing.apply")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canKeepCurrent}
                              onClick={() => {
                                const p = round3(r.current);
                                setManual({ ...manual, [r.id]: String(p) });
                                applyOne.mutate({ id: r.id, price: p });
                              }}
                              title={t("pricing.keepCurrentHint")}
                            >
                              {t("pricing.keepCurrent")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: "ok" | "warn" | "danger";
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warn"
      ? "border-amber-300 bg-amber-50"
      : "border-success/30 bg-success/5";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function FormulaExplainer({
  sample,
  method,
  markupPct,
  marginPct,
  anchorPrice,
  includeGst,
  gstRate,
  rounding,
  suggest,
  locale,
  t,
  packagingPerUnit,
  overheadPerUnit,
}: {
  sample: Row | undefined;
  method: Method;
  markupPct: number;
  marginPct: number;
  anchorPrice: number;
  includeGst: boolean;
  gstRate: number;
  rounding: Rounding;
  suggest: (cost: number) => number;
  locale: string;
  t: (k: import("@/lib/i18n/dictionaries").DictKey) => string;
  packagingPerUnit: number;
  overheadPerUnit: number;
}) {
  const rawCost = sample?.avg_unit_cost ?? 0;
  // Step labelled "cost" in the strategy box is now the TRUE landed cost.
  const cost = round3(rawCost + packagingPerUnit + overheadPerUnit);
  // Step 1: pre-GST price from the strategy
  let preGst = 0;
  let stepLabel = "";
  switch (method) {
    case "margin": {
      const m = marginPct / 100;
      preGst = m >= 1 ? cost * 2 : cost / (1 - m);
      stepLabel = `${cost.toFixed(3)} ÷ (1 − ${(marginPct / 100).toFixed(2)})`;
      break;
    }
    case "markup":
      preGst = cost * (1 + markupPct / 100);
      stepLabel = `${cost.toFixed(3)} × (1 + ${(markupPct / 100).toFixed(2)})`;
      break;
    case "keystone":
      preGst = cost * 2;
      stepLabel = `${cost.toFixed(3)} × 2`;
      break;
    case "anchor":
      preGst = anchorPrice;
      stepLabel = `${anchorPrice.toFixed(3)} (anchor)`;
      break;
  }
  const withGst = includeGst && gstRate > 0 ? preGst * (1 + gstRate / 100) : preGst;
  const final = suggest(cost);

  const copy = {
    margin: t("pricing.copyMargin"),
    markup: t("pricing.copyMarkup"),
    keystone: t("pricing.copyKeystone"),
    anchor: t("pricing.copyAnchor"),
  }[method];

  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900">{copy}</p>
      <div className="grid gap-3 sm:grid-cols-6">
        <StepBox
          n={1}
          stepLabel={t("pricing.stepLabel")}
          label={t("pricing.stepCost")}
          value={formatJOD(rawCost, locale)}
        />
        <StepBox
          n={2}
          stepLabel={t("pricing.stepLabel")}
          label={t("pricing.trueCost")}
          value={`= ${formatJOD(cost, locale)}`}
          sub={`+ ${packagingPerUnit.toFixed(3)} ${t("pricing.packagingNote")} + ${overheadPerUnit.toFixed(3)} ${t("pricing.overheadShare")}`}
        />
        <StepBox n={3} stepLabel={t("pricing.stepLabel")} label={t("pricing.stepStrategy")} value={`= ${formatJOD(preGst, locale)}`} sub={stepLabel} />
        <StepBox
          n={4}
          stepLabel={t("pricing.stepLabel")}
          label={includeGst ? t("pricing.gstApplied").replace("{p}", String(gstRate)) : t("pricing.gstIncluded")}
          value={`= ${formatJOD(withGst, locale)}`}
          sub={includeGst ? `${preGst.toFixed(3)} × ${(1 + gstRate / 100).toFixed(2)}` : t("pricing.noChange")}
        />
        <StepBox
          n={5}
          stepLabel={t("pricing.stepLabel")}
          label={t("pricing.stepRound")}
          value={`= ${formatJOD(final, locale)}`}
          sub={rounding}
        />
        <StepBox
          n={6}
          stepLabel={t("pricing.stepLabel")}
          tone="primary"
          label={t("pricing.stepFinal")}
          value={formatJOD(final, locale)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("pricing.formulaFooter").replace("{name}", sample?.name ?? "—")}
      </p>
    </div>
  );
}

/**
 * Bulk discount panel.
 *
 * Lets the operator knock a percentage or a fixed JOD amount off every
 * product's default_selling_price, with optional filters (gender, watch type,
 * brand). A "Preview" pass runs the same math on the client so the operator
 * sees how many products will be touched and what the total markdown is
 * BEFORE writing anything to the database.
 *
 * When applied, the server-side RPC takes per-product snapshots of the old
 * price into bulk_price_changes, so any run can be reverted in one click.
 * The "Recent runs" table below the form is the audit trail with a Revert
 * button next to runs that haven't been undone yet.
 */
function BulkDiscount() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState<number>(10);
  const [gender, setGender] = useState("");
  const [watchType, setWatchType] = useState("");
  const [brand, setBrand] = useState("");
  const [note, setNote] = useState("");

  // Load the catalogue (just what we need to preview the math client-side).
  // Reuses the same "pricing-rows" cache when the parent page already fetched.
  const { data: catalogue } = useQuery({
    queryKey: ["bulk-discount-catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, default_selling_price, gender, watch_type, brand")
        .eq("is_active", true)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        price: Number(r.default_selling_price ?? 0),
        gender: (r.gender as string | null) ?? null,
        watch_type: (r.watch_type as string | null) ?? null,
        brand: (r.brand as string | null) ?? null,
      }));
    },
  });

  // Distinct brands for the brand filter dropdown.
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of catalogue ?? []) if (r.brand) set.add(r.brand);
    return Array.from(set).sort();
  }, [catalogue]);

  // Live preview computation. We compute the same way the server does so the
  // operator sees the truth — including the 0.001 floor and the > 0 guard.
  const preview = useMemo(() => {
    if (!catalogue) return null;
    const eligible = catalogue.filter((r) => {
      if (r.price <= 0) return false;
      if (gender && r.gender !== gender) return false;
      if (watchType && r.watch_type !== watchType) return false;
      if (brand && r.brand !== brand) return false;
      return true;
    });
    let markdown = 0, count = 0;
    for (const r of eligible) {
      const next =
        kind === "percent"
          ? Math.max(0.001, round3(r.price * (1 - value / 100)))
          : Math.max(0.001, round3(r.price - value));
      if (next < r.price) {
        count += 1;
        markdown += r.price - next;
      }
    }
    return { count, markdown: round3(markdown) };
  }, [catalogue, kind, value, gender, watchType, brand]);

  type Run = {
    id: string;
    applied_at: string;
    kind: string;
    value: number;
    scope_label: string;
    products_count: number;
    total_markdown: number;
    reversed_at: string | null;
    note: string | null;
  };

  const { data: runs } = useQuery({
    queryKey: ["bulk-discount-runs"],
    queryFn: async (): Promise<Run[]> => {
      const { data, error } = await supabase
        .from("bulk_price_runs")
        .select("id, applied_at, kind, value, scope_label, products_count, total_markdown, reversed_at, note")
        .order("applied_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Run[];
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("apply_bulk_discount", {
        p_kind: kind,
        p_value: value,
        p_gender: gender || undefined,
        p_watch_type: watchType || undefined,
        p_brand: brand || undefined,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        count: Number(row?.products_count ?? 0),
        markdown: Number(row?.total_markdown ?? 0),
      };
    },
    onSuccess: (r) => {
      if (r.count === 0) {
        toast.info(t("pricing.discountNoChange"));
      } else {
        toast.success(
          t("pricing.discountApplied")
            .replace("{n}", String(r.count))
            .replace("{amt}", formatJOD(r.markdown, locale)),
        );
        setNote("");
      }
      qc.invalidateQueries({ queryKey: ["pricing-rows"] });
      qc.invalidateQueries({ queryKey: ["bulk-discount-catalogue"] });
      qc.invalidateQueries({ queryKey: ["bulk-discount-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revert = useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.rpc("revert_bulk_discount", { p_run_id: runId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return Number(row?.restored_count ?? 0);
    },
    onSuccess: (n) => {
      toast.success(t("pricing.discountReverted").replace("{n}", String(n)));
      qc.invalidateQueries({ queryKey: ["pricing-rows"] });
      qc.invalidateQueries({ queryKey: ["bulk-discount-catalogue"] });
      qc.invalidateQueries({ queryKey: ["bulk-discount-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="size-4" aria-hidden /> {t("pricing.discountTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{t("pricing.discountHint")}</p>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>{t("pricing.discountKind")}</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}>
              <option value="percent">{t("pricing.discountPercent")}</option>
              <option value="fixed">{t("pricing.discountFixed")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{kind === "percent" ? t("pricing.discountPercentValue") : t("pricing.discountFixedValue")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={kind === "percent" ? 95 : 9999} step="0.001" dir="ltr"
                value={value}
                onChange={(e) =>
                  setValue(
                    kind === "percent"
                      ? Math.max(0, Math.min(95, Number(e.target.value) || 0))
                      : Math.max(0, Number(e.target.value) || 0),
                  )
                }
              />
              <span className="text-xs text-muted-foreground">{kind === "percent" ? "%" : "JOD"}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pricing.filterGender")}</Label>
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">{t("shop.allGenders")}</option>
              <option value="men">{t("shop.men")}</option>
              <option value="women">{t("shop.women")}</option>
              <option value="unisex">{t("shop.unisex")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pricing.filterWatchType")}</Label>
            <Select value={watchType} onChange={(e) => setWatchType(e.target.value)}>
              <option value="">{t("shop.allTypes")}</option>
              <option value="battery">{t("shop.battery")}</option>
              <option value="automatic">{t("shop.automatic")}</option>
              <option value="digital">{t("shop.digital")}</option>
              <option value="smartwatch">{t("shop.smartwatch")}</option>
              <option value="accessories">{t("shop.accessories")}</option>
              <option value="other">{t("shop.otherType")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pricing.filterBrand")}</Label>
            <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">{t("pricing.allBrands")}</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label>{t("pricing.discountNote")}</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("pricing.discountNotePh")}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <div className="text-sm">
            {preview ? (
              <>
                <span className="font-semibold">{preview.count}</span> {t("pricing.discountPreviewCount")}
                {preview.count > 0 && (
                  <span className="ms-2 text-muted-foreground">
                    · {t("pricing.discountPreviewMarkdown")} <strong className="text-primary">{formatJOD(preview.markdown, locale)}</strong>
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{t("pricing.discountLoading")}</span>
            )}
          </div>
          <Button
            onClick={() => apply.mutate()}
            disabled={apply.isPending || !preview || preview.count === 0 || value <= 0}
          >
            {apply.isPending && <Loader2 className="size-4 animate-spin" />}
            <Percent className="size-4" />
            {t("pricing.discountApply")}
          </Button>
        </div>

        {runs && runs.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t("pricing.discountRecentRuns")}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pricing.discountWhen")}</TableHead>
                    <TableHead>{t("pricing.discountWhat")}</TableHead>
                    <TableHead>{t("pricing.discountScope")}</TableHead>
                    <TableHead className="text-end">{t("pricing.discountAffected")}</TableHead>
                    <TableHead className="text-end">{t("pricing.discountMarkdown")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id} className={r.reversed_at ? "opacity-60" : ""}>
                      <TableCell className="text-xs">{new Date(r.applied_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {r.kind === "percent" ? `${Number(r.value).toFixed(2)}%` : formatJOD(Number(r.value), locale)} {t("pricing.discountOff")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.scope_label}
                        {r.note && <div className="text-[10px]">{r.note}</div>}
                      </TableCell>
                      <TableCell className="text-end">{r.products_count}</TableCell>
                      <TableCell className="text-end font-medium">{formatJOD(Number(r.total_markdown), locale)}</TableCell>
                      <TableCell className="text-end">
                        {r.reversed_at ? (
                          <Badge variant="secondary" className="text-[10px]">{t("pricing.discountWasReverted")}</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revert.mutate(r.id)}
                            disabled={revert.isPending}
                          >
                            {t("pricing.discountRevert")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepBox({
  n,
  stepLabel,
  label,
  value,
  sub,
  tone,
}: {
  n: number;
  stepLabel: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary";
}) {
  return (
    <div className={`rounded-md border p-2 ${tone === "primary" ? "border-primary/30 bg-primary/5" : "bg-muted/30"}`}>
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{stepLabel} {n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone === "primary" ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground" dir="ltr">{sub}</div>}
    </div>
  );
}
