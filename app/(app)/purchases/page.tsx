"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PackageOpen, PackageCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJOD, round3 } from "@/lib/utils";
import type { Tables } from "@/types/database.types";
import { ImportControls } from "@/components/import-controls";
import { numOr, type Col } from "@/lib/xlsx-utils";

const PUR_COLS: Col[] = [
  { key: "sku", header: "SKU" },
  { key: "name", header: "Name" },
  { key: "qty", header: "Quantity" },
  { key: "unit_cost_src", header: "Unit Cost (source currency)" },
  { key: "reference", header: "Order Reference (first row)" },
  { key: "currency", header: "Source Currency (first row)" },
  { key: "fx_rate", header: "FX to JOD (first row)" },
  { key: "shipping", header: "Shipping JOD (first row)" },
  { key: "customs", header: "Customs JOD (first row)" },
  { key: "clearance", header: "Clearance JOD (first row)" },
];
const PUR_EXAMPLE = [
  { sku: "sj2401234567", name: "BIDEN Mens Watch", qty: 3, unit_cost_src: 9.2, reference: "Shein order #12345", currency: "USD", fx_rate: 0.709, shipping: 6, customs: 4, clearance: 2 },
  { sku: "st2409876543", name: "Leather strap", qty: 10, unit_cost_src: 1.5, reference: "", currency: "", fx_rate: "", shipping: "", customs: "", clearance: "" },
];

export default function PurchasesPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["purchases"],
    queryFn: async (): Promise<Tables<"purchases">[]> => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const receive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("receive_purchase", { p_purchase_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("purchases.received"));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function importPurchase(rows: Record<string, string>[]) {
    const items = rows.filter((r) => r.sku && r.name && numOr(r.qty) > 0);
    if (items.length === 0) throw new Error("No item rows (need SKU, Name, Quantity)");
    const h = rows[0];
    const fx = numOr(h.fx_rate, 1) || 1;
    const shipping = round3(numOr(h.shipping));
    const customs = round3(numOr(h.customs));
    const clearance = round3(numOr(h.clearance));
    const overhead = round3(shipping + customs + clearance);

    const lines = items.map((it) => {
      const qty = Math.max(1, Math.round(numOr(it.qty, 1)));
      const unitSrc = round3(numOr(it.unit_cost_src));
      const unitJod = round3(unitSrc * fx);
      return { sku: it.sku, name: it.name, qty, unitSrc, unitJod, value: round3(qty * unitJod) };
    });
    const itemsTotal = round3(lines.reduce((s, l) => s + l.value, 0));

    const { data: userData } = await supabase.auth.getUser();
    const { data: docNo } = await supabase.rpc("next_doc_no", { p_type: "purchase" });
    const { data: purchase, error } = await supabase
      .from("purchases")
      .insert({
        doc_no: docNo as string,
        reference: h.reference || "Excel import",
        source: "manual",
        src_currency: h.currency || "USD",
        fx_rate: fx,
        items_total: itemsTotal,
        shipping_cost: shipping,
        customs_cost: customs,
        clearance_cost: clearance,
        total_landed: round3(itemsTotal + overhead),
        status: "ordered",
        created_by: userData.user?.id,
      })
      .select("id")
      .single();
    if (error || !purchase) throw new Error(error?.message ?? "could not create purchase");

    for (const l of lines) {
      let { data: prod } = await supabase.from("products").select("id").eq("sku", l.sku).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
      let productId = prod?.id as string | undefined;
      if (!productId) {
        const ins = await supabase.from("products").insert({ sku: l.sku, name: l.name, source: "manual", created_by: userData.user?.id }).select("id").single();
        if (ins.error) throw new Error(ins.error.message);
        productId = ins.data.id;
        await supabase.from("inventory").insert({ product_id: productId });
      }
      const alloc = itemsTotal > 0 ? round3(overhead * (l.value / itemsTotal)) : 0;
      const landedUnit = round3(l.unitJod + (l.qty > 0 ? alloc / l.qty : 0));
      const { error: itErr } = await supabase.from("purchase_items").insert({
        purchase_id: purchase.id, product_id: productId, sku: l.sku, name: l.name,
        qty: l.qty, unit_cost_src: l.unitSrc, unit_cost_jod: l.unitJod, allocated_overhead: alloc, landed_unit_cost: landedUnit,
      });
      if (itErr) throw new Error(itErr.message);
    }
    qc.invalidateQueries({ queryKey: ["purchases"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    return { created: lines.length };
  }

  return (
    <>
      <PageHeader
        title={t("purchases.title")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportControls templateName="zaman-purchase-template.xlsx" cols={PUR_COLS} examples={PUR_EXAMPLE} onImport={importPurchase} size="sm" />
            <Link href="/purchases/new" className={buttonVariants()}>
              <Plus className="size-4" /> {t("purchases.add")}
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data && data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("purchases.reference")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead className="text-end">{t("purchases.landed")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.reference || p.doc_no || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.order_date}</TableCell>
                    <TableCell className="text-end font-medium">
                      {formatJOD(p.total_landed, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "received" ? "success" : "warning"}>
                        {p.status === "received" ? t("purchases.received") : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {p.status !== "received" && (
                        <Link href={`/purchases/${p.id}/receive`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          <PackageCheck className="size-4" /> {t("purchases.receive")}
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <PackageOpen className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
              <Link href="/purchases/new" className={buttonVariants({ variant: "outline" })}>
                <Plus className="size-4" /> {t("purchases.add")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
