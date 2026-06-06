"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, PackageOpen, Receipt, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCustomers } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatJOD, round3 } from "@/lib/utils";

type Tab = "sales" | "purchases";

export default function TransactionsReportPage() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>("sales");

  return (
    <>
      <PageHeader
        title={t("txReport.title")}
        description={t("txReport.subtitle")}
        action={
          <Link href="/reports" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" /> {t("nav.reports")}
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 border-b">
        <button
          className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === "sales" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("sales")}
        >
          <Receipt className="size-4" /> {t("txReport.salesInvoices")}
        </button>
        <button
          className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === "purchases" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("purchases")}
        >
          <PackageOpen className="size-4" /> {t("txReport.purchaseOrders")}
        </button>
      </div>

      {tab === "sales" ? <SalesReport locale={locale} t={t} /> : <PurchasesReport locale={locale} t={t} />}
    </>
  );
}

/* ------------------------ Sales (Invoices) ----------------------- */

type SaleItemDetail = { description: string | null; products: { name: string | null; sku: string | null } | null };
type SaleRow = {
  id: string; sale_no: string; sale_date: string; total: number; gross_profit: number;
  status: string; customer_id: string | null; notes: string | null;
  customers: { name: string } | null;
  sale_items: SaleItemDetail[];
  invoices: { invoice_no: string }[] | null;
};

function SalesReport({ locale, t }: { locale: string; t: (k: never) => string }) {
  const supabase = createClient();
  const { data: customers } = useCustomers();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [productQ, setProductQ] = useState("");
  const [invQ, setInvQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tx-sales", from, to],
    queryFn: async (): Promise<SaleRow[]> => {
      let q = supabase
        .from("sales")
        .select("id, sale_no, sale_date, total, gross_profit, status, customer_id, notes, customers(name), sale_items(description, products(name, sku)), invoices(invoice_no)")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("sale_date", { ascending: false });
      if (from) q = q.gte("sale_date", from);
      if (to) q = q.lte("sale_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const pq = productQ.trim().toLowerCase();
    const iq = invQ.trim().toLowerCase();
    return rows.filter((s) => {
      if (customerId && s.customer_id !== customerId) return false;
      if (iq) {
        const matchesSale = s.sale_no.toLowerCase().includes(iq);
        const matchesInv = (s.invoices ?? []).some((i) => i.invoice_no.toLowerCase().includes(iq));
        if (!matchesSale && !matchesInv) return false;
      }
      if (pq) {
        const hit = (s.sale_items ?? []).some((it) =>
          (it.description ?? "").toLowerCase().includes(pq) ||
          (it.products?.name ?? "").toLowerCase().includes(pq) ||
          (it.products?.sku ?? "").toLowerCase().includes(pq),
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [data, customerId, productQ, invQ]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const total = round3(filtered.reduce((s, r) => s + Number(r.total), 0));
    const profit = round3(filtered.reduce((s, r) => s + Number(r.gross_profit), 0));
    const customers = new Set(filtered.map((r) => r.customer_id).filter(Boolean)).size;
    return { count, total, profit, customers };
  }, [filtered]);

  function clearFilters() { setFrom(""); setTo(""); setCustomerId(""); setProductQ(""); setInvQ(""); }
  const j = (n: number) => formatJOD(n, locale);

  return (
    <>
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t("common.date" as never) + " — " + t("txReport.from" as never)}>
              <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t("common.date" as never) + " — " + t("txReport.to" as never)}>
              <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label={t("sell.customer" as never)}>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">—</option>
                {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t("txReport.product" as never)}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-8" placeholder="SKU / name" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
              </div>
            </Field>
            <Field label={t("txReport.invoiceNo" as never)}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-8" placeholder="ZW-… / INV-…" value={invQ} onChange={(e) => setInvQ(e.target.value)} />
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex flex-wrap gap-5 text-sm">
              <Stat label={t("txReport.totalInvoices" as never)} value={String(totals.count)} />
              <Stat label={t("common.total" as never)} value={j(totals.total)} accent />
              <Stat label={t("common.profit" as never)} value={j(totals.profit)} />
              <Stat label={t("txReport.uniqueCustomers" as never)} value={String(totals.customers)} />
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="size-4" /> {t("txReport.clear" as never)}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("common.empty" as never)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sales.no" as never)}</TableHead>
                  <TableHead>{t("txReport.invoiceNo" as never)}</TableHead>
                  <TableHead>{t("common.date" as never)}</TableHead>
                  <TableHead>{t("sell.customer" as never)}</TableHead>
                  <TableHead>{t("common.status" as never)}</TableHead>
                  <TableHead className="text-end">{t("common.total" as never)}</TableHead>
                  <TableHead className="text-end">{t("common.profit" as never)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.sale_no}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {(s.invoices ?? []).map((i) => i.invoice_no).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.sale_date}</TableCell>
                    <TableCell>{s.customers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "returned" ? "warning" : s.status === "completed" ? "success" : "secondary"}>
                        {s.status === "returned" ? t("sales.returned" as never) : s.status === "packed" ? t("sales.packed" as never) : s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">{j(s.total)}</TableCell>
                    <TableCell className={"text-end font-medium " + (s.gross_profit >= 0 ? "text-success" : "text-destructive")}>{j(s.gross_profit)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={5} className="text-end">{t("txReport.grandTotal" as never)}</TableCell>
                  <TableCell className="text-end">{j(totals.total)}</TableCell>
                  <TableCell className={"text-end " + (totals.profit >= 0 ? "text-success" : "text-destructive")}>{j(totals.profit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------ Purchases ----------------------- */

type PurchaseRow = {
  id: string; doc_no: string | null; reference: string | null; order_date: string;
  total_landed: number; status: string; vendor_id: string | null;
  vendors: { name: string; name_ar: string | null } | null;
  purchase_items: { name: string | null; sku: string | null; products: { name: string | null; sku: string | null } | null }[];
};

function PurchasesReport({ locale, t }: { locale: string; t: (k: never) => string }) {
  const supabase = createClient();

  const { data: vendors } = useQuery({
    queryKey: ["vendors-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name, name_ar").is("deleted_at", null).order("name");
      return data ?? [];
    },
  });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [productQ, setProductQ] = useState("");
  const [docQ, setDocQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tx-purchases", from, to],
    queryFn: async (): Promise<PurchaseRow[]> => {
      let q = supabase
        .from("purchases")
        .select("id, doc_no, reference, order_date, total_landed, status, vendor_id, vendors(name, name_ar), purchase_items(name, sku, products(name, sku))")
        .is("deleted_at", null)
        .order("order_date", { ascending: false });
      if (from) q = q.gte("order_date", from);
      if (to) q = q.lte("order_date", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const pq = productQ.trim().toLowerCase();
    const dq = docQ.trim().toLowerCase();
    return rows.filter((p) => {
      if (vendorId && p.vendor_id !== vendorId) return false;
      if (dq) {
        const match = (p.doc_no ?? "").toLowerCase().includes(dq) || (p.reference ?? "").toLowerCase().includes(dq);
        if (!match) return false;
      }
      if (pq) {
        const hit = (p.purchase_items ?? []).some((it) =>
          (it.name ?? "").toLowerCase().includes(pq) ||
          (it.sku ?? "").toLowerCase().includes(pq) ||
          (it.products?.name ?? "").toLowerCase().includes(pq) ||
          (it.products?.sku ?? "").toLowerCase().includes(pq),
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [data, vendorId, productQ, docQ]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const total = round3(filtered.reduce((s, r) => s + Number(r.total_landed), 0));
    const vendors = new Set(filtered.map((r) => r.vendor_id).filter(Boolean)).size;
    return { count, total, vendors };
  }, [filtered]);

  function clearFilters() { setFrom(""); setTo(""); setVendorId(""); setProductQ(""); setDocQ(""); }
  const j = (n: number) => formatJOD(n, locale);

  return (
    <>
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t("common.date" as never) + " — " + t("txReport.from" as never)}>
              <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t("common.date" as never) + " — " + t("txReport.to" as never)}>
              <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label={t("vendors.title" as never)}>
              <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">—</option>
                {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{locale === "ar" && v.name_ar ? v.name_ar : v.name}</option>)}
              </Select>
            </Field>
            <Field label={t("txReport.product" as never)}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-8" placeholder="SKU / name" value={productQ} onChange={(e) => setProductQ(e.target.value)} />
              </div>
            </Field>
            <Field label={t("txReport.purchaseNo" as never)}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="ps-8" placeholder="P-… / ref" value={docQ} onChange={(e) => setDocQ(e.target.value)} />
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex flex-wrap gap-5 text-sm">
              <Stat label={t("txReport.totalPurchases" as never)} value={String(totals.count)} />
              <Stat label={t("purchases.landed" as never)} value={j(totals.total)} accent />
              <Stat label={t("txReport.uniqueVendors" as never)} value={String(totals.vendors)} />
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="size-4" /> {t("txReport.clear" as never)}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("common.empty" as never)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("txReport.purchaseNo" as never)}</TableHead>
                  <TableHead>{t("purchases.reference" as never)}</TableHead>
                  <TableHead>{t("common.date" as never)}</TableHead>
                  <TableHead>{t("vendors.title" as never)}</TableHead>
                  <TableHead className="text-end">{t("txReport.items" as never)}</TableHead>
                  <TableHead>{t("common.status" as never)}</TableHead>
                  <TableHead className="text-end">{t("purchases.landed" as never)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.doc_no || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.order_date}</TableCell>
                    <TableCell>{p.vendors ? (locale === "ar" && p.vendors.name_ar ? p.vendors.name_ar : p.vendors.name) : "—"}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{(p.purchase_items ?? []).length}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "received" ? "success" : "warning"}>
                        {p.status === "received" ? t("purchases.received" as never) : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">{j(p.total_landed)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={6} className="text-end">{t("txReport.grandTotal" as never)}</TableCell>
                  <TableCell className="text-end text-primary">{j(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------ shared ----------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-semibold " + (accent ? "text-primary" : "")}>{value}</div>
    </div>
  );
}
