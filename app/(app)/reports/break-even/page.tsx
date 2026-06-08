"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, TrendingUp, ArrowDownToLine, ArrowUpToLine, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/export-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD } from "@/lib/utils";

type Breakeven = {
  period: { from: string; to: string };
  revenue: number;
  units_sold: number;
  avg_price_per_unit: number;
  variable_costs: { cogs: number; delivery: number; packaging: number; total: number };
  fixed_costs: { opex: number; marketing: number; depreciation: number; total: number };
  contribution_margin: number;
  cm_ratio: number;
  bep_revenue: number | null;
  bep_units: number | null;
  gap_to_bep: number | null;
  past_bep: boolean;
  per_product: Array<{
    product_id: string;
    sku: string;
    name: string;
    color: string;
    units_sold: number;
    revenue: number;
    unit_price: number;
    unit_cost: number;
    unit_margin: number;
    margin_pct: number;
    allocated_fixed: number;
    bep_units: number | null;
  }>;
};

export default function BreakEvenPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["breakeven", from, to],
    queryFn: async (): Promise<Breakeven> => {
      const { data, error } = await supabase.rpc("get_breakeven", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as Breakeven;
    },
  });

  const progressPct = useMemo(() => {
    if (!data || data.bep_revenue == null || data.bep_revenue <= 0) return 0;
    return Math.min(100, Math.round((data.revenue / data.bep_revenue) * 100));
  }, [data]);

  return (
    <>
      <PageHeader title={t("breakeven.title")} description={t("breakeven.subtitle")} />

      {/* Period picker */}
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">{t("breakeven.from")}</div>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("breakeven.to")}</div>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("breakeven.quickRange")}</div>
            <Select onChange={(e) => {
              const v = e.target.value;
              const y = now.getFullYear();
              if (v === "ytd") { setFrom(`${y}-01-01`); setTo(now.toISOString().slice(0, 10)); }
              if (v === "month") { const m = String(now.getMonth() + 1).padStart(2, "0"); setFrom(`${y}-${m}-01`); setTo(now.toISOString().slice(0, 10)); }
              if (v === "lastyear") { setFrom(`${y-1}-01-01`); setTo(`${y-1}-12-31`); }
              if (v === "all") { setFrom("2000-01-01"); setTo("2100-12-31"); }
            }}>
              <option value="">—</option>
              <option value="ytd">{t("breakeven.ytd")}</option>
              <option value="month">{t("breakeven.thisMonth")}</option>
              <option value="lastyear">{t("breakeven.lastYear")}</option>
              <option value="all">{t("breakeven.allTime")}</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <>
          {/* Headline status */}
          <Card className={"mb-6 border-2 " + (data.past_bep ? "border-success/40 bg-success/5" : "border-amber-300 bg-amber-50")}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {data.past_bep
                    ? <CheckCircle2 className="size-8 text-success" />
                    : <AlertTriangle className="size-8 text-amber-600" />}
                  <div>
                    <div className="text-lg font-bold">
                      {data.past_bep ? t("breakeven.aboveBep") : t("breakeven.belowBep")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {data.bep_revenue == null
                        ? t("breakeven.noBep")
                        : data.past_bep
                          ? t("breakeven.aboveBepDetail").replace("{amount}", formatJOD(data.revenue - data.bep_revenue, locale))
                          : t("breakeven.belowBepDetail").replace("{amount}", formatJOD(data.gap_to_bep ?? 0, locale))}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-xs text-muted-foreground">{t("breakeven.bepRevenue")}</div>
                  <div className="text-2xl font-bold text-primary">
                    {data.bep_revenue == null ? "—" : formatJOD(data.bep_revenue, locale)}
                  </div>
                  {data.bep_units != null && (
                    <div className="text-xs text-muted-foreground">≈ {data.bep_units} {t("breakeven.unitsLabel")}</div>
                  )}
                </div>
              </div>
              {/* Progress bar — revenue toward BEP */}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{t("breakeven.currentRev")}: {formatJOD(data.revenue, locale)}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={"h-full transition-all " + (data.past_bep ? "bg-success" : "bg-amber-500")}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI grid */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={TrendingUp} label={t("breakeven.revenue")} value={formatJOD(data.revenue, locale)} />
            <Kpi icon={ArrowUpToLine} label={t("breakeven.fixed")} value={formatJOD(data.fixed_costs.total, locale)} sub={t("breakeven.fixedSub")} />
            <Kpi icon={ArrowDownToLine} label={t("breakeven.variable")} value={formatJOD(data.variable_costs.total, locale)} sub={t("breakeven.variableSub")} />
            <Kpi icon={Target} label={t("breakeven.cmRatio")} value={`${data.cm_ratio.toFixed(1)}%`} sub={t("breakeven.cmRatioSub")} accent />
          </div>

          {/* Breakdown */}
          <div className="mb-6 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 font-semibold">{t("breakeven.fixed")}</div>
                <Row label={t("breakeven.opex")} value={formatJOD(data.fixed_costs.opex, locale)} />
                <Row label={t("breakeven.marketing")} value={formatJOD(data.fixed_costs.marketing, locale)} />
                <Row label={t("breakeven.depreciation")} value={formatJOD(data.fixed_costs.depreciation, locale)} />
                <Row label={t("breakeven.total")} value={formatJOD(data.fixed_costs.total, locale)} bold />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 font-semibold">{t("breakeven.variable")}</div>
                <Row label={t("breakeven.cogs")} value={formatJOD(data.variable_costs.cogs, locale)} />
                <Row label={t("breakeven.delivery")} value={formatJOD(data.variable_costs.delivery, locale)} />
                <Row label={t("breakeven.packaging")} value={formatJOD(data.variable_costs.packaging, locale)} />
                <Row label={t("breakeven.total")} value={formatJOD(data.variable_costs.total, locale)} bold />
                <div className="mt-3 border-t pt-3">
                  <Row label={t("breakeven.contribution")} value={formatJOD(data.contribution_margin, locale)} accent />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Per-product table */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <div className="font-semibold">{t("breakeven.perProduct")}</div>
                  <div className="text-xs text-muted-foreground">{t("breakeven.perProductHint")}</div>
                </div>
                <ExportButton
                  filename="breakeven-per-product"
                  rows={data.per_product}
                  cols={[
                    { header: "SKU", accessor: (p) => p.sku },
                    { header: "Name", accessor: (p) => p.name },
                    { header: "Color", accessor: (p) => p.color },
                    { header: "Units sold", accessor: (p) => p.units_sold },
                    { header: "Revenue", accessor: (p) => p.revenue },
                    { header: "Unit price", accessor: (p) => p.unit_price },
                    { header: "Unit cost", accessor: (p) => p.unit_cost },
                    { header: "Unit margin", accessor: (p) => p.unit_margin },
                    { header: "Margin %", accessor: (p) => p.margin_pct },
                    { header: "Allocated fixed", accessor: (p) => p.allocated_fixed },
                    { header: "BEP units", accessor: (p) => p.bep_units ?? "" },
                  ]}
                />
              </div>
              {data.per_product.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("breakeven.product")}</TableHead>
                      <TableHead className="text-end">{t("breakeven.unitsSold")}</TableHead>
                      <TableHead className="text-end">{t("breakeven.unitPrice")}</TableHead>
                      <TableHead className="text-end">{t("breakeven.unitCost")}</TableHead>
                      <TableHead className="text-end">{t("breakeven.unitMargin")}</TableHead>
                      <TableHead className="text-end">{t("breakeven.marginPct")}</TableHead>
                      <TableHead className="text-end">{t("breakeven.bepUnits")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.per_product.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.sku} · {p.color}</div>
                        </TableCell>
                        <TableCell className="text-end">{p.units_sold}</TableCell>
                        <TableCell className="text-end text-muted-foreground">{formatJOD(p.unit_price, locale)}</TableCell>
                        <TableCell className="text-end text-muted-foreground">{formatJOD(p.unit_cost, locale)}</TableCell>
                        <TableCell className="text-end font-medium">{formatJOD(p.unit_margin, locale)}</TableCell>
                        <TableCell className="text-end">
                          <Badge variant={p.margin_pct >= 50 ? "success" : p.margin_pct >= 25 ? "secondary" : "warning"}>
                            {p.margin_pct.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {p.bep_units == null ? "—" : `${p.bep_units} ${t("breakeven.unitsLabel")}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
              )}
            </CardContent>
          </Card>

          <p className="mt-4 text-xs text-muted-foreground">{t("breakeven.formulaNote")}</p>
        </>
      )}
    </>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <div className={"text-2xl font-bold " + (accent ? "text-primary" : "")}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className={
      "flex justify-between py-1 text-sm " +
      (bold ? "border-t mt-1 pt-2 font-bold " : "") +
      (accent ? "text-primary font-semibold " : "")
    }>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
