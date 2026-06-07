"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, ArrowLeft, ArrowRight, CheckCircle2, Truck,
  Receipt, Package, Pencil, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useSellableProducts } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Stepper } from "@/components/stepper";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatJOD, round3, num3 } from "@/lib/utils";
import { CURRENCIES, fetchFxRate } from "@/lib/fx";

type Line = {
  key: string;
  productId: string;
  newSku: string;
  newName: string;
  qty: number;
  unitCostSrc: number;
  isAsset: boolean;
  assetName: string;
  depYears: string;
  depStartDate: string;
  salvageValue: string;
};

function emptyLine(today: string): Line {
  return {
    key: crypto.randomUUID(), productId: "", newSku: "", newName: "",
    qty: 1, unitCostSrc: 0,
    isAsset: false, assetName: "", depYears: "5", depStartDate: today, salvageValue: "0",
  };
}

export default function NewPurchasePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: products } = useSellableProducts();
  const today = new Date().toISOString().slice(0, 10);

  const { data: vendors } = useQuery({
    queryKey: ["vendors-pay"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name, name_ar")
        .is("deleted_at", null).eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts-pay"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name")
        .eq("is_courier", false).is("deleted_at", null).order("created_at");
      return data ?? [];
    },
  });

  const [step, setStep] = useState(0);

  // Step 1 — info
  const [vendorId, setVendorId] = useState("");
  const [reference, setReference] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [srcCurrency, setSrcCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("0.709");
  const [fxAsOf, setFxAsOf] = useState<string | null>(null);
  const [fxBusy, setFxBusy] = useState(false);

  // Fetch a fresh rate the first time the wizard mounts.
  useEffect(() => {
    refreshFx(srcCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshFx(toCurrency: string) {
    if (!toCurrency || toCurrency === "JOD") {
      setFxRate("1"); setFxAsOf(null); return;
    }
    setFxBusy(true);
    try {
      const r = await fetchFxRate(toCurrency, "JOD");
      setFxRate(String(round3(r.rate)));
      setFxAsOf(r.asOf ?? null);
    } catch (e) {
      toast.error(`FX rate: ${(e as Error).message}`);
    } finally {
      setFxBusy(false);
    }
  }
  const [paidAccount, setPaidAccount] = useState("");

  // Step 2 — items
  const [lines, setLines] = useState<Line[]>([emptyLine(today)]);
  const [assetLineKey, setAssetLineKey] = useState<string | null>(null);

  // Step 3 — landed costs
  const [shipping, setShipping] = useState("0");
  const [customs, setCustoms] = useState("0");
  const [clearance, setClearance] = useState("0");
  const [other, setOther] = useState("0");

  const fx = Number(fxRate) || 0;
  const overhead = round3(
    (Number(shipping) || 0) + (Number(customs) || 0) + (Number(clearance) || 0) + (Number(other) || 0),
  );

  const computed = useMemo(() => {
    const withJod = lines.map((l) => {
      const unitJod = round3(l.unitCostSrc * fx);
      const value = round3(l.qty * unitJod);
      return { ...l, unitJod, value };
    });
    const itemsTotal = round3(withJod.reduce((s, l) => s + l.value, 0));
    const final = withJod.map((l) => {
      const share = itemsTotal > 0 ? l.value / itemsTotal : 0;
      const alloc = round3(overhead * share);
      const landedUnit = round3(l.unitJod + (l.qty > 0 ? alloc / l.qty : 0));
      const lineLanded = round3(landedUnit * l.qty);
      return { ...l, alloc, landedUnit, lineLanded };
    });
    return { final, itemsTotal, totalLanded: round3(itemsTotal + overhead) };
  }, [lines, fx, overhead]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const save = useMutation({
    mutationFn: async () => {
      const valid = computed.final.filter((l) => (l.productId || (l.newSku && l.newName)) && l.qty > 0);
      if (valid.length === 0) throw new Error(t("purchases.needItem"));

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { data: docNo } = await supabase.rpc("next_doc_no", { p_type: "purchase" });
      const allAssets = valid.every((l) => l.isAsset);

      const { data: purchase, error: pErr } = await supabase.from("purchases").insert({
        doc_no: docNo as string,
        reference: reference.trim() || null,
        source: "manual",
        order_date: orderDate,
        src_currency: srcCurrency,
        fx_rate: fx,
        items_total: computed.itemsTotal,
        shipping_cost: round3(Number(shipping) || 0),
        customs_cost: round3(Number(customs) || 0),
        clearance_cost: round3(Number(clearance) || 0),
        other_cost: round3(Number(other) || 0),
        total_landed: computed.totalLanded,
        status: "ordered",
        paid_account_id: paidAccount || null,
        vendor_id: vendorId || null,
        is_asset: allAssets,
        created_by: uid,
      }).select("id").single();
      if (pErr) throw pErr;

      if (paidAccount && computed.totalLanded > 0) {
        await supabase.from("cash_transactions").insert({
          account_id: paidAccount, direction: "out", amount: computed.totalLanded,
          category: "purchase", txn_date: orderDate, ref_table: "purchases", ref_id: purchase.id,
          note: reference.trim() || (docNo as string) || "Purchase", created_by: uid,
        });
      }

      for (const l of valid) {
        let productId = l.productId;
        if (!productId) {
          const ins = await supabase.from("products").insert({
            sku: l.newSku.trim(), name: l.newName.trim(), source: "manual", created_by: uid,
          }).select("id").single();
          if (ins.error) throw ins.error;
          productId = ins.data.id;
          await supabase.from("inventory").insert({ product_id: productId });
        }

        const itemErr = await supabase.from("purchase_items").insert({
          purchase_id: purchase.id,
          product_id: productId,
          sku: l.newSku.trim() || null,
          name: l.newName.trim() || null,
          qty: l.qty,
          unit_cost_src: l.unitCostSrc,
          unit_cost_jod: l.unitJod,
          allocated_overhead: l.alloc,
          landed_unit_cost: l.landedUnit,
          is_asset: l.isAsset,
          asset_name: l.isAsset ? (l.assetName.trim() || l.newName.trim() || null) : null,
          depreciation_years: l.isAsset ? (Number(l.depYears) || null) : null,
          depreciation_start_date: l.isAsset ? l.depStartDate : null,
          salvage_value: l.isAsset ? round3(Number(l.salvageValue) || 0) : 0,
        });
        if (itemErr.error) throw itemErr.error;
      }
      return purchase.id;
    },
    onSuccess: () => {
      toast.success(t("purchases.created"));
      qc.invalidateQueries();
      router.push("/purchases");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const steps = [t("purchases.stepInfo"), t("purchases.stepItems"), t("purchases.stepCosts"), t("purchases.stepReview")];
  const canNext = step === 0
    ? !!orderDate
    : step === 1
      ? lines.some((l) => (l.productId || (l.newSku && l.newName)) && l.qty > 0)
      : true;

  const assetLine = lines.find((l) => l.key === assetLineKey);

  return (
    <>
      <PageHeader
        title={t("purchases.add")}
        action={
          <Link href="/purchases" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" /> {t("common.back")}
          </Link>
        }
      />

      <div className="mx-auto mb-6 max-w-3xl">
        <Stepper steps={steps} current={step} />
      </div>

      <div className="mx-auto max-w-4xl">
        {/* STEP 0 — Info */}
        {step === 0 && (
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2 font-semibold"><Receipt className="size-4 text-primary" /> {t("purchases.stepInfo")}</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("vendors.title")}>
                  <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                    <option value="">—</option>
                    {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{locale === "ar" && v.name_ar ? v.name_ar : v.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("purchases.reference")}>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" placeholder="Order #123 / Invoice" />
                </Field>
                <Field label={t("common.date")}>
                  <Input type="date" dir="ltr" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </Field>
                <Field label={t("purchases.payment")}>
                  <Select value={paidAccount} onChange={(e) => setPaidAccount(e.target.value)}>
                    <option value="">{t("purchases.unpaid")}</option>
                    {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("purchases.srcCurrency")}>
                  <Select
                    value={srcCurrency}
                    onChange={(e) => { setSrcCurrency(e.target.value); refreshFx(e.target.value); }}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("purchases.fxRate")}>
                  <div className="flex gap-1">
                    <Input
                      type="number" step="0.0001" dir="ltr"
                      value={fxRate}
                      onChange={(e) => setFxRate(e.target.value)}
                      placeholder="1 JOD ="
                    />
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => refreshFx(srcCurrency)}
                      disabled={fxBusy || srcCurrency === "JOD"}
                      title={t("purchases.refreshFx")}
                    >
                      {fxBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    </Button>
                  </div>
                  {fxAsOf && (
                    <p className="text-xs text-muted-foreground">{t("purchases.fxAsOf")} {fxAsOf}</p>
                  )}
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 1 — Items */}
        {step === 1 && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" /> {t("purchases.items")}</div>
                <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine(today)])}>
                  <Plus className="size-4" /> {t("common.add")}
                </Button>
              </div>
              {lines.map((l) => {
                const c = computed.final.find((x) => x.key === l.key);
                return (
                  <div key={l.key} className={"rounded-md border p-3 " + (l.isAsset ? "border-primary/40 bg-primary/5" : "")}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Select value={l.productId} onChange={(e) => updateLine(l.key, { productId: e.target.value })}>
                          <option value="">+ {t("products.add")}…</option>
                          {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </Select>
                      </div>
                      <Input className="sm:col-span-2" type="number" min={1} dir="ltr" value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: Math.max(1, Number(e.target.value)) })} aria-label={t("common.qty")} />
                      <Input className="sm:col-span-3" type="number" step="0.001" dir="ltr" value={l.unitCostSrc}
                        onChange={(e) => updateLine(l.key, { unitCostSrc: Number(e.target.value) })}
                        aria-label={`${t("common.cost")} (${srcCurrency})`} placeholder={srcCurrency} />
                      <div className="flex items-center justify-between gap-2 sm:col-span-2">
                        <span className="text-xs text-muted-foreground" title={t("purchases.landedUnit")}>
                          {c ? num3(c.landedUnit) : "0.000"}
                        </span>
                        <button onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    {!l.productId && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Input dir="ltr" placeholder={t("products.sku")} value={l.newSku}
                          onChange={(e) => updateLine(l.key, { newSku: e.target.value })} />
                        <Input placeholder={t("common.name")} value={l.newName}
                          onChange={(e) => updateLine(l.key, { newName: e.target.value })} />
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="size-4 accent-[var(--primary)]"
                          checked={l.isAsset}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updateLine(l.key, { isAsset: checked });
                            if (checked) setAssetLineKey(l.key);
                          }} />
                        <span className={l.isAsset ? "font-medium text-primary" : "text-muted-foreground"}>
                          {t("purchases.itemIsAsset")}
                        </span>
                      </label>
                      {l.isAsset && (
                        <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setAssetLineKey(l.key)}>
                          <Pencil className="size-3.5" /> {l.depYears} {t("purchases.years")} · {l.depStartDate}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end rounded-md bg-muted/50 p-3 text-sm">
                <div className="space-y-0.5 text-end">
                  <div className="text-muted-foreground">{t("purchases.items")}: <span className="font-semibold text-foreground">{formatJOD(computed.itemsTotal, locale)}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2 — Landed costs */}
        {step === 2 && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 font-semibold"><Truck className="size-4 text-primary" /> {t("purchases.stepCosts")}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={t("purchases.shipping")}>
                  <Input type="number" step="0.001" dir="ltr" value={shipping} onChange={(e) => setShipping(e.target.value)} />
                </Field>
                <Field label={t("purchases.customs")}>
                  <Input type="number" step="0.001" dir="ltr" value={customs} onChange={(e) => setCustoms(e.target.value)} />
                </Field>
                <Field label={t("purchases.clearance")}>
                  <Input type="number" step="0.001" dir="ltr" value={clearance} onChange={(e) => setClearance(e.target.value)} />
                </Field>
                <Field label={t("purchases.other")}>
                  <Input type="number" step="0.001" dir="ltr" value={other} onChange={(e) => setOther(e.target.value)} />
                </Field>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <Row label={t("purchases.items")} value={formatJOD(computed.itemsTotal, locale)} />
                <Row label={`${t("purchases.shipping")} +`} value={formatJOD(overhead, locale)} />
                <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold">
                  <span>{t("purchases.landed")}</span>
                  <span className="text-primary">{formatJOD(computed.totalLanded, locale)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-primary" /> {t("purchases.stepReview")}</div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <Row label={t("vendors.title")} value={(vendors ?? []).find((v) => v.id === vendorId)?.name ?? "—"} />
                <Row label={t("purchases.reference")} value={reference || "—"} />
                <Row label={t("common.date")} value={orderDate} />
                <Row label={t("purchases.payment")} value={paidAccount ? ((accounts ?? []).find((a) => a.id === paidAccount)?.name ?? "—") : t("purchases.unpaid")} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">{t("purchases.items")}</div>
                {computed.final.map((l) => {
                  const isAssetItem = l.isAsset;
                  return (
                    <div key={l.key} className={"flex items-start justify-between gap-3 rounded-md border p-2.5 text-sm " + (isAssetItem ? "border-primary/40 bg-primary/5" : "")}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{l.assetName || l.newName || (products ?? []).find((p) => p.id === l.productId)?.name || "—"}</span>
                          {isAssetItem && (
                            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{t("purchases.asset")}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ×{l.qty} · {srcCurrency} {l.unitCostSrc} · {t("purchases.landedUnit")}: {num3(l.landedUnit)}
                          {isAssetItem && <> · {l.depYears} {t("purchases.years")}</>}
                        </div>
                      </div>
                      <span className={"shrink-0 text-end font-medium " + (isAssetItem ? "text-primary" : "")}>
                        {formatJOD(l.lineLanded, locale)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <Row label={t("purchases.items")} value={formatJOD(computed.itemsTotal, locale)} />
                <Row label={`${t("purchases.shipping")} +`} value={formatJOD(overhead, locale)} />
                <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold">
                  <span>{t("purchases.landed")}</span>
                  <span className="text-primary">{formatJOD(computed.totalLanded, locale)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <ArrowLeft className="size-4" /> {t("common.back")}
            </Button>
          ) : <span />}
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{t("wf.next")} <ArrowRight className="size-4" /></Button>
          ) : (
            <Button size="lg" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {t("purchases.createNow")}
            </Button>
          )}
        </div>
      </div>

      {/* Per-line asset depreciation dialog */}
      <Dialog open={!!assetLine} onOpenChange={(o) => !o && setAssetLineKey(null)}>
        <DialogContent onClose={() => setAssetLineKey(null)}>
          <DialogHeader>
            <DialogTitle>{t("purchases.assetDetails")}</DialogTitle>
          </DialogHeader>
          {assetLine && (
            <form onSubmit={(e) => { e.preventDefault(); setAssetLineKey(null); }} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>{t("purchases.assetName")}</Label>
                <Input value={assetLine.assetName}
                  onChange={(e) => updateLine(assetLine.key, { assetName: e.target.value })}
                  placeholder={assetLine.newName || (products ?? []).find((p) => p.id === assetLine.productId)?.name || t("purchases.asset")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.qty")} *</Label>
                <Input required type="number" min={1} dir="ltr" value={assetLine.qty}
                  onChange={(e) => updateLine(assetLine.key, { qty: Math.max(1, Number(e.target.value)) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.cost")} ({srcCurrency}) *</Label>
                <Input required type="number" step="0.001" min={0} dir="ltr" value={assetLine.unitCostSrc}
                  onChange={(e) => updateLine(assetLine.key, { unitCostSrc: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("purchases.depYears")} *</Label>
                <Input required type="number" step="0.5" min={0.5} dir="ltr" value={assetLine.depYears}
                  onChange={(e) => updateLine(assetLine.key, { depYears: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("purchases.depStart")} *</Label>
                <Input required type="date" dir="ltr" value={assetLine.depStartDate}
                  onChange={(e) => updateLine(assetLine.key, { depStartDate: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("purchases.salvageValue")} (JOD)</Label>
                <Input type="number" step="0.001" dir="ltr" value={assetLine.salvageValue}
                  onChange={(e) => updateLine(assetLine.key, { salvageValue: e.target.value })} />
                <p className="text-xs text-muted-foreground">{t("purchases.salvageHint")}</p>
              </div>
              <div className="col-span-2 rounded-md bg-muted/40 p-3 text-sm">
                {(() => {
                  const cost = (computed.final.find((x) => x.key === assetLine.key)?.lineLanded ?? 0);
                  const yrs = Number(assetLine.depYears) || 0;
                  const sal = Number(assetLine.salvageValue) || 0;
                  const monthly = yrs > 0 ? round3((cost - sal) / (yrs * 12)) : 0;
                  const annual = yrs > 0 ? round3((cost - sal) / yrs) : 0;
                  return (
                    <>
                      <Row label={t("purchases.assetCost")} value={formatJOD(cost, locale)} />
                      <Row label={t("purchases.monthlyDep")} value={formatJOD(monthly, locale)} />
                      <Row label={t("purchases.annualDep")} value={formatJOD(annual, locale)} />
                      {cost <= 0 && <p className="mt-2 text-xs text-destructive">{t("purchases.assetCostHint")}</p>}
                    </>
                  );
                })()}
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline"
                  onClick={() => { updateLine(assetLine.key, { isAsset: false }); setAssetLineKey(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("common.save")}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1 " + (className ?? "")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

