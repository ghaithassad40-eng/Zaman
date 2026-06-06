"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useSellableProducts } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatJOD, round3, num3 } from "@/lib/utils";

type Line = {
  key: string;
  productId: string; // empty = create new
  newSku: string;
  newName: string;
  qty: number;
  unitCostSrc: number;
};

function emptyLine(): Line {
  return { key: crypto.randomUUID(), productId: "", newSku: "", newName: "", qty: 1, unitCostSrc: 0 };
}

export default function NewPurchasePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: products } = useSellableProducts();
  const { data: accounts } = useQuery({
    queryKey: ["accounts-pay"],
    queryFn: async () => {
      const { data } = await supabase
        .from("accounts").select("id, name").eq("is_courier", false).is("deleted_at", null).order("created_at");
      return data ?? [];
    },
  });
  const { data: vendors } = useQuery({
    queryKey: ["vendors-pay"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors").select("id, name, name_ar").is("deleted_at", null).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const [paidAccount, setPaidAccount] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [reference, setReference] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [srcCurrency, setSrcCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("0.709");
  const [shipping, setShipping] = useState("0");
  const [customs, setCustoms] = useState("0");
  const [clearance, setClearance] = useState("0");
  const [other, setOther] = useState("0");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  // Asset tracking
  const [isAsset, setIsAsset] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [depYears, setDepYears] = useState("5");
  const [depStartDate, setDepStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [salvageValue, setSalvageValue] = useState("0");

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
      return { ...l, alloc, landedUnit };
    });
    return { final, itemsTotal, totalLanded: round3(itemsTotal + overhead) };
  }, [lines, fx, overhead]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const save = useMutation({
    mutationFn: async () => {
      const valid = computed.final.filter(
        (l) => (l.productId || (l.newSku && l.newName)) && l.qty > 0,
      );
      if (valid.length === 0) throw new Error("Add at least one item");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      const { data: docNo } = await supabase.rpc("next_doc_no", { p_type: "purchase" });

      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          doc_no: docNo as string,
          reference: reference.trim() || null,
          source: "shein",
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
          is_asset: isAsset,
          asset_name: isAsset ? (assetName.trim() || reference.trim() || null) : null,
          depreciation_years: isAsset ? (Number(depYears) || null) : null,
          depreciation_start_date: isAsset ? depStartDate : null,
          salvage_value: isAsset ? round3(Number(salvageValue) || 0) : 0,
          created_by: uid,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      // Pay from the chosen account — deduct the landed total.
      if (paidAccount && computed.totalLanded > 0) {
        const { error: payErr } = await supabase.from("cash_transactions").insert({
          account_id: paidAccount,
          direction: "out",
          amount: computed.totalLanded,
          category: "purchase",
          txn_date: orderDate,
          ref_table: "purchases",
          ref_id: purchase.id,
          note: reference.trim() || (docNo as string) || "Purchase",
          created_by: uid,
        });
        if (payErr) throw payErr;
      }

      for (const l of valid) {
        let productId = l.productId;
        // Create the product if this is a new SKU.
        if (!productId) {
          const { data: prod, error: prodErr } = await supabase
            .from("products")
            .insert({
              sku: l.newSku.trim(),
              name: l.newName.trim(),
              source: "shein",
              created_by: uid,
            })
            .select("id")
            .single();
          if (prodErr) throw prodErr;
          productId = prod.id;
          await supabase.from("inventory").insert({ product_id: productId });
        }

        const { error: itemErr } = await supabase.from("purchase_items").insert({
          purchase_id: purchase.id,
          product_id: productId,
          sku: l.newSku.trim() || null,
          name: l.newName.trim() || null,
          qty: l.qty,
          unit_cost_src: l.unitCostSrc,
          unit_cost_jod: l.unitJod,
          allocated_overhead: l.alloc,
          landed_unit_cost: l.landedUnit,
        });
        if (itemErr) throw itemErr;
      }

      return purchase.id;
    },
    onSuccess: () => {
      toast.success(t("purchases.add"));
      qc.invalidateQueries();
      router.push("/purchases");
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("purchases.reference")} className="col-span-2">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" />
              </Field>
              <Field label={t("common.date")}>
                <Input type="date" dir="ltr" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </Field>
              <Field label={t("purchases.srcCurrency")}>
                <Input dir="ltr" value={srcCurrency} onChange={(e) => setSrcCurrency(e.target.value.toUpperCase())} />
              </Field>
              <Field label={t("purchases.fxRate")}>
                <Input type="number" step="0.0001" dir="ltr" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
              </Field>
            </div>

            {/* Line items */}
            <div className="space-y-3 border-t pt-4">
              <Label>{t("purchases.items")}</Label>
              {computed.final.map((l) => (
                <div key={l.key} className="rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <Select
                        value={l.productId}
                        onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                      >
                        <option value="">+ {t("products.add")}…</option>
                        {(products ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Input
                      className="sm:col-span-2"
                      type="number"
                      min={1}
                      dir="ltr"
                      value={l.qty}
                      onChange={(e) => updateLine(l.key, { qty: Math.max(1, Number(e.target.value)) })}
                      aria-label={t("common.qty")}
                    />
                    <Input
                      className="sm:col-span-3"
                      type="number"
                      step="0.001"
                      dir="ltr"
                      value={l.unitCostSrc}
                      onChange={(e) => updateLine(l.key, { unitCostSrc: Number(e.target.value) })}
                      aria-label={`${t("common.cost")} (${srcCurrency})`}
                      placeholder={srcCurrency}
                    />
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <span className="text-xs text-muted-foreground" title={t("purchases.landedUnit")}>
                        {num3(l.landedUnit)}
                      </span>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {!l.productId && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        dir="ltr"
                        placeholder={t("products.sku")}
                        value={l.newSku}
                        onChange={(e) => updateLine(l.key, { newSku: e.target.value })}
                      />
                      <Input
                        placeholder={t("common.name")}
                        value={l.newName}
                        onChange={(e) => updateLine(l.key, { newName: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="size-4" /> {t("common.add")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Costs + summary */}
        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-2">
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

            <div className="space-y-1.5 border-t pt-3 text-sm">
              <SummaryRow label={t("purchases.items")} value={formatJOD(computed.itemsTotal, locale)} />
              <SummaryRow label={t("purchases.shipping") + " +"} value={formatJOD(overhead, locale)} />
              <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
                <span>{t("purchases.landed")}</span>
                <span className="text-primary">{formatJOD(computed.totalLanded, locale)}</span>
              </div>
            </div>

            <div className="space-y-1 border-t pt-3">
              <Label className="text-xs">{t("vendors.title")}</Label>
              <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">—</option>
                {(vendors ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{locale === "ar" && v.name_ar ? v.name_ar : v.name}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1 border-t pt-3">
              <Label className="text-xs">{t("purchases.payment")}</Label>
              <Select value={paidAccount} onChange={(e) => setPaidAccount(e.target.value)}>
                <option value="">{t("purchases.unpaid")}</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
              {paidAccount && <p className="text-xs text-muted-foreground">{t("purchases.paidNote")}</p>}
            </div>

            <div className="space-y-1 border-t pt-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={isAsset}
                  onChange={(e) => {
                    setIsAsset(e.target.checked);
                    if (e.target.checked) setAssetDialogOpen(true);
                  }}
                />
                {t("purchases.isAsset")}
              </label>
              {isAsset && (
                <div className="mt-1 rounded-md border bg-muted/30 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{assetName || reference || t("purchases.asset")}</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => setAssetDialogOpen(true)}>
                      {t("common.edit")}
                    </button>
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    {depYears} {t("purchases.years")} · {t("purchases.depStartShort")} {depStartDate}
                  </div>
                </div>
              )}
            </div>

            <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t("purchases.receive")} → {t("nav.purchases")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={assetDialogOpen} onOpenChange={(o) => !o && setAssetDialogOpen(false)}>
        <DialogContent onClose={() => setAssetDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t("purchases.assetDetails")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); setAssetDialogOpen(false); }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="col-span-2 space-y-1.5">
              <Label>{t("purchases.assetName")}</Label>
              <Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder={reference || t("purchases.asset")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("purchases.depYears")} *</Label>
              <Input required type="number" step="0.5" min={0.5} dir="ltr" value={depYears} onChange={(e) => setDepYears(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("purchases.depStart")} *</Label>
              <Input required type="date" dir="ltr" value={depStartDate} onChange={(e) => setDepStartDate(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("purchases.salvageValue")} (JOD)</Label>
              <Input type="number" step="0.001" dir="ltr" value={salvageValue} onChange={(e) => setSalvageValue(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("purchases.salvageHint")}</p>
            </div>
            <div className="col-span-2 rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("purchases.monthlyDep")}</span>
                <span className="font-medium">
                  {formatJOD(
                    Number(depYears) > 0
                      ? round3((computed.totalLanded - (Number(salvageValue) || 0)) / (Number(depYears) * 12))
                      : 0,
                    locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("purchases.annualDep")}</span>
                <span className="font-medium">
                  {formatJOD(
                    Number(depYears) > 0
                      ? round3((computed.totalLanded - (Number(salvageValue) || 0)) / Number(depYears))
                      : 0,
                    locale,
                  )}
                </span>
              </div>
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setAssetDialogOpen(false); setIsAsset(false); }}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </div>
          </form>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
