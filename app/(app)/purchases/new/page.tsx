"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

  const [reference, setReference] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [srcCurrency, setSrcCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("0.709");
  const [shipping, setShipping] = useState("0");
  const [customs, setCustoms] = useState("0");
  const [clearance, setClearance] = useState("0");
  const [other, setOther] = useState("0");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

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
          created_by: uid,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

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
