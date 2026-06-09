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
  image_urls: string[] | null;
  qty_on_hand: number;
  avg_unit_cost: number;
  default_selling_price: number;
  expected_selling_price: number | null;
};

type Method = "markup" | "margin" | "keystone" | "anchor";
type Rounding = "none" | "round5" | "endsIn99" | "endsIn95" | "wholeJod";

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

  const { data: rows, isLoading } = useQuery({
    queryKey: ["pricing-rows"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, brand, color, image_urls, default_selling_price, expected_selling_price, inventory(qty_on_hand, avg_unit_cost)",
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
   *  Returns 0 when there is no cost basis and no anchor — the operator
   *  hasn't given enough information for a recommendation. */
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
      const suggested = suggest(r.avg_unit_cost);
      const current = r.default_selling_price || r.expected_selling_price || 0;
      // gross margin% on the CURRENT selling price (operator's status quo)
      const currentMargin =
        current > 0 && r.avg_unit_cost > 0
          ? ((current - r.avg_unit_cost) / current) * 100
          : current > 0
          ? 100
          : null;
      const suggestedMargin =
        suggested > 0 && r.avg_unit_cost > 0
          ? ((suggested - r.avg_unit_cost) / suggested) * 100
          : null;
      return {
        ...r,
        current,
        currentMargin,
        suggested,
        suggestedMargin,
        delta: suggested - current,
        belowCost: current > 0 && current < r.avg_unit_cost,
        noPrice: current === 0,
      };
    });
  }, [rows, method, markupPct, marginPct, anchorPrice, includeGst, rounding, gstRate]);

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
                    const same = round3(r.current) === r.suggested;
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
                          <Button
                            size="sm"
                            variant={same ? "outline" : "default"}
                            disabled={r.suggested <= 0 || same || busy === r.id}
                            onClick={() => applyOne.mutate({ id: r.id, price: r.suggested })}
                          >
                            {busy === r.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : same ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <Save className="size-3" />
                            )}
                            {same ? t("pricing.upToDate") : t("pricing.apply")}
                          </Button>
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
}) {
  const cost = sample?.avg_unit_cost ?? 0;
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
      <div className="grid gap-3 sm:grid-cols-5">
        <StepBox n={1} stepLabel={t("pricing.stepLabel")} label={t("pricing.stepCost")} value={formatJOD(cost, locale)} />
        <StepBox n={2} stepLabel={t("pricing.stepLabel")} label={t("pricing.stepStrategy")} value={`= ${formatJOD(preGst, locale)}`} sub={stepLabel} />
        <StepBox
          n={3}
          stepLabel={t("pricing.stepLabel")}
          label={includeGst ? t("pricing.gstApplied").replace("{p}", String(gstRate)) : t("pricing.gstIncluded")}
          value={`= ${formatJOD(withGst, locale)}`}
          sub={includeGst ? `${preGst.toFixed(3)} × ${(1 + gstRate / 100).toFixed(2)}` : t("pricing.noChange")}
        />
        <StepBox
          n={4}
          stepLabel={t("pricing.stepLabel")}
          label={t("pricing.stepRound")}
          value={`= ${formatJOD(final, locale)}`}
          sub={rounding}
        />
        <StepBox
          n={5}
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
