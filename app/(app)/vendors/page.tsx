"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Truck,
  Loader2,
  Plus,
  Star,
  FileText,
  Wrench,
  Package,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatJOD, round3 } from "@/lib/utils";
import type { Tables, TablesInsert, Enums } from "@/types/database.types";
import { downloadStatementPdf, type StatementLine } from "@/lib/pdf/statement";

type Vendor = Tables<"vendors">;
type Txn = Tables<"vendor_transactions">;

const KIND_ICON: Record<string, React.ElementType> = {
  delivery: Truck,
  service: Wrench,
  supplier: Package,
  other: Building2,
};
const KIND_KEY: Record<string, string> = {
  delivery: "vendors.kDelivery",
  service: "vendors.kService",
  supplier: "vendors.kSupplier",
  other: "vendors.kOther",
};

function balanceOf(v: Vendor, txns: Txn[]) {
  return round3(
    Number(v.opening_balance ?? 0) +
      txns.reduce((s, x) => s + Number(x.debit) - Number(x.credit), 0),
  );
}

export default function VendorsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [stmtVendor, setStmtVendor] = useState<Vendor | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(v: Vendor) {
    setBusyId(v.id);
    try {
      // Block delete if vendor has any transactions (preserves accounting history).
      const { count, error: cErr } = await supabase
        .from("vendor_transactions")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", v.id);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        toast.error(t("vendors.hasTransactions"));
        return;
      }
      if (!window.confirm(`${t("vendors.deleteConfirm")}\n\n${v.name}`)) return;
      const { error } = await supabase.from("vendors").update({ deleted_at: new Date().toISOString() }).eq("id", v.id);
      if (error) throw error;
      toast.success(t("vendors.deleted"));
      qc.invalidateQueries({ queryKey: ["vendors"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const vendors =
        (await supabase
          .from("vendors")
          .select("*")
          .is("deleted_at", null)
          .order("created_at"))
          .data ?? [];
      const txns =
        (await supabase
          .from("vendor_transactions")
          .select("*")
          .order("txn_date")
          .order("created_at"))
          .data ?? [];
      const banks =
        (await supabase
          .from("accounts")
          .select("id, name")
          .is("deleted_at", null)
          .order("created_at"))
          .data ?? [];
      return { vendors, txns, banks };
    },
  });

  const txnsByVendor = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const x of data?.txns ?? []) {
      const arr = m.get(x.vendor_id) ?? [];
      arr.push(x);
      m.set(x.vendor_id, arr);
    }
    return m;
  }, [data?.txns]);

  return (
    <>
      <PageHeader
        title={t("vendors.title")}
        description={t("vendors.subtitle")}
        action={
          <div className="flex items-center gap-2">
            <ExportButton
              filename="vendors"
              rows={data?.vendors}
              cols={[
                { header: "Name", accessor: (v) => v.name },
                { header: "Kind", accessor: (v) => v.kind },
                { header: "Phone", accessor: (v) => v.phone ?? "" },
                { header: "Email", accessor: (v) => v.email ?? "" },
                { header: "Balance (JOD)", accessor: (v) => Number(v.opening_balance ?? 0) },
                { header: "Notes", accessor: (v) => v.notes ?? "" },
                { header: "Active", accessor: (v) => v.is_active },
              ]}
            />
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> {t("vendors.add")}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (data?.vendors.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Truck className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("vendors.noVendors")}</p>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> {t("vendors.add")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.vendors.map((v) => {
            const Icon = KIND_ICON[v.kind] ?? Building2;
            const bal = balanceOf(v, txnsByVendor.get(v.id) ?? []);
            return (
              <Card key={v.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <div className="flex items-center gap-1 font-semibold">
                          {v.name}
                          {v.is_default_delivery && (
                            <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t(KIND_KEY[v.kind] as never)}
                          {v.phone ? ` · ${v.phone}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">
                      {bal > 0
                        ? t("vendors.owesUs")
                        : bal < 0
                          ? t("vendors.weOwe")
                          : t("vendors.settled")}
                    </div>
                    <div
                      className={
                        "text-xl font-bold " +
                        (bal > 0
                          ? "text-success"
                          : bal < 0
                            ? "text-destructive"
                            : "")
                      }
                    >
                      {formatJOD(Math.abs(bal), locale)}
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setStmtVendor(v)}
                    >
                      <FileText className="size-4" /> {t("vendors.statement")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditVendor(v)} title={t("common.edit")}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === v.id}
                      onClick={() => remove(v)}
                      title={t("common.delete")}
                    >
                      {busyId === v.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddVendorDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <EditVendorDialog vendor={editVendor} onClose={() => setEditVendor(null)} />
      <StatementDialog
        vendor={stmtVendor}
        txns={stmtVendor ? txnsByVendor.get(stmtVendor.id) ?? [] : []}
        banks={data?.banks ?? []}
        onClose={() => setStmtVendor(null)}
      />
    </>
  );
}

function AddVendorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [kind, setKind] = useState<Enums<"vendor_kind">>("delivery");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [opening, setOpening] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Enter a name");
      const { data: userData } = await supabase.auth.getUser();
      const payload: TablesInsert<"vendors"> = {
        name: name.trim(),
        name_ar: nameAr.trim() || null,
        kind,
        phone: phone.trim() || null,
        email: email.trim() || null,
        opening_balance: round3(Number(opening) || 0),
        is_default_delivery: isDefault && kind === "delivery",
        created_by: userData.user?.id,
      };
      // Only one default delivery vendor — clear others first.
      if (payload.is_default_delivery) {
        await supabase
          .from("vendors")
          .update({ is_default_delivery: false })
          .eq("is_default_delivery", true);
      }
      const { error } = await supabase.from("vendors").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("vendors.add"));
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setName(""); setNameAr(""); setPhone(""); setEmail(""); setOpening(""); setIsDefault(false); setKind("delivery");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("vendors.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("vendors.name")} *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("vendors.name")} (AR)</Label>
              <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("vendors.kind")}</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as Enums<"vendor_kind">)}>
                <option value="delivery">{t("vendors.kDelivery")}</option>
                <option value="service">{t("vendors.kService")}</option>
                <option value="supplier">{t("vendors.kSupplier")}</option>
                <option value="other">{t("vendors.kOther")}</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("vendors.openingBalance")}</Label>
              <Input type="number" step="0.001" dir="ltr" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email")}</Label>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {kind === "delivery" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              {t("vendors.defaultDelivery")}
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditVendorDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", name_ar: "", kind: "delivery" as Enums<"vendor_kind">,
    phone: "", email: "", opening: "", is_default: false, is_active: true,
  });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (vendor && vendor.id !== loadedFor) {
    setLoadedFor(vendor.id);
    setForm({
      name: vendor.name,
      name_ar: vendor.name_ar ?? "",
      kind: vendor.kind,
      phone: vendor.phone ?? "",
      email: vendor.email ?? "",
      opening: String(vendor.opening_balance ?? 0),
      is_default: vendor.is_default_delivery,
      is_active: vendor.is_active,
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!vendor) return;
      if (!form.name.trim()) throw new Error("Enter a name");
      const payload = {
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        kind: form.kind,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        opening_balance: round3(Number(form.opening) || 0),
        is_default_delivery: form.is_default && form.kind === "delivery",
        is_active: form.is_active,
      };
      // Only one default delivery vendor — clear others first if promoting.
      if (payload.is_default_delivery && !vendor.is_default_delivery) {
        await supabase.from("vendors").update({ is_default_delivery: false }).eq("is_default_delivery", true);
      }
      const { error } = await supabase.from("vendors").update(payload).eq("id", vendor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      qc.invalidateQueries({ queryKey: ["vendors"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!vendor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("common.edit")}{vendor ? ` · ${vendor.name}` : ""}</DialogTitle>
        </DialogHeader>
        {vendor && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("vendors.name")} *</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("vendors.name")} (AR)</Label>
                <Input dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("vendors.kind")}</Label>
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Enums<"vendor_kind"> })}>
                  <option value="delivery">{t("vendors.kDelivery")}</option>
                  <option value="service">{t("vendors.kService")}</option>
                  <option value="supplier">{t("vendors.kSupplier")}</option>
                  <option value="other">{t("vendors.kOther")}</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("vendors.openingBalance")}</Label>
                <Input type="number" step="0.001" dir="ltr" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("common.phone")}</Label>
                <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.email")}</Label>
                <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            {form.kind === "delivery" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]"
                  checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                {t("vendors.defaultDelivery")}
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]"
                checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              {t("products.active")}
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ENTRY_KINDS = [
  { id: "owe_us", labelKey: "vendors.eOweUs", debit: true, bank: "none", category: "charge" },
  { id: "bill_us", labelKey: "vendors.eBillUs", debit: false, bank: "none", category: "vendor_bill" },
  { id: "paid_us", labelKey: "vendors.ePaidUs", debit: false, bank: "in", category: "settlement" },
  { id: "we_paid", labelKey: "vendors.eWePaid", debit: true, bank: "out", category: "payment" },
] as const;

const CAT_KEY: Record<string, string> = {
  cod_collected: "delivery.collected",
  delivery_fee: "delivery.fee",
};

function StatementDialog({
  vendor,
  txns,
  banks,
  onClose,
}: {
  vendor: Vendor | null;
  txns: Txn[];
  banks: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [pdfBusy, setPdfBusy] = useState(false);

  // form
  const [entryKind, setEntryKind] = useState<(typeof ENTRY_KINDS)[number]["id"]>("paid_us");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState("2026-06-06");

  const opening = Number(vendor?.opening_balance ?? 0);

  // Build ascending lines with running balance.
  const lines: StatementLine[] = useMemo(() => {
    let run = opening;
    return txns.map((x) => {
      run = round3(run + Number(x.debit) - Number(x.credit));
      const label = x.note || (x.category && CAT_KEY[x.category] ? t(CAT_KEY[x.category] as never) : x.category) || "—";
      return { txn_date: x.txn_date, label, debit: Number(x.debit), credit: Number(x.credit), balance: run };
    });
  }, [txns, opening, t]);

  const totalDebit = round3(txns.reduce((s, x) => s + Number(x.debit), 0));
  const totalCredit = round3(txns.reduce((s, x) => s + Number(x.credit), 0));
  const closing = round3(opening + totalDebit - totalCredit);

  const cfg = ENTRY_KINDS.find((k) => k.id === entryKind)!;

  const addEntry = useMutation({
    mutationFn: async () => {
      if (!vendor) return;
      const amt = round3(Number(amount) || 0);
      if (amt <= 0) throw new Error("Enter an amount");
      if (cfg.bank !== "none" && !account) throw new Error("Select an account");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      const { error } = await supabase.from("vendor_transactions").insert({
        vendor_id: vendor.id,
        txn_date: date,
        category: cfg.category,
        debit: cfg.debit ? amt : 0,
        credit: cfg.debit ? 0 : amt,
        account_id: cfg.bank !== "none" ? account : null,
        note: note.trim() || null,
        created_by: uid,
      });
      if (error) throw error;

      // Mirror cash movement on the chosen bank account.
      if (cfg.bank !== "none" && account) {
        const { error: e2 } = await supabase.from("cash_transactions").insert({
          account_id: account,
          direction: cfg.bank,
          amount: amt,
          category: cfg.category,
          txn_date: date,
          note: `${vendor.name} — ${t(cfg.labelKey as never)}`,
          ref_table: "vendors",
          ref_id: vendor.id,
          created_by: uid,
        });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(t("vendors.addEntry"));
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setAmount(""); setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function makePdf() {
    if (!vendor) return;
    setPdfBusy(true);
    try {
      const company = (await supabase.from("company_settings").select("*").limit(1).maybeSingle()).data;
      await downloadStatementPdf({
        party: { name: vendor.name, name_ar: vendor.name_ar, phone: vendor.phone },
        titleEn: "Statement of Account",
        titleAr: "كشف حساب",
        partyLabel: "Vendor / المورّد",
        oweLabel: "owes you",
        oweReverseLabel: "you owe",
        company: company ?? null,
        lines,
        opening: round3(opening),
        totalDebit,
        totalCredit,
        closing,
        generatedOn: "2026-06-06",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <Dialog open={!!vendor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("vendors.statement")} · {vendor?.name}</DialogTitle>
        </DialogHeader>
        {vendor && (
          <div className="space-y-5 py-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("vendors.opening")} value={formatJOD(opening, locale)} />
              <Stat label={t("vendors.totalDebit")} value={formatJOD(totalDebit, locale)} />
              <Stat label={t("vendors.totalCredit")} value={formatJOD(totalCredit, locale)} />
              <Stat
                label={closing >= 0 ? t("vendors.owesUs") : t("vendors.weOwe")}
                value={formatJOD(Math.abs(closing), locale)}
                accent
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.notes")}</TableHead>
                    <TableHead className="text-end">{t("vendors.debit")}</TableHead>
                    <TableHead className="text-end">{t("vendors.credit")}</TableHead>
                    <TableHead className="text-end">{t("vendors.running")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                        {t("common.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{l.txn_date}</TableCell>
                        <TableCell>{l.label}</TableCell>
                        <TableCell className="text-end text-success">
                          {l.debit ? (
                            <span className="inline-flex items-center gap-1">
                              <ArrowDownLeft className="size-3.5" />{formatJOD(l.debit, locale)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-end text-destructive">
                          {l.credit ? (
                            <span className="inline-flex items-center gap-1">
                              <ArrowUpRight className="size-3.5" />{formatJOD(l.credit, locale)}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-end font-medium">{formatJOD(l.balance, locale)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Add entry */}
            <form
              onSubmit={(e) => { e.preventDefault(); addEntry.mutate(); }}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-2"
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("vendors.entryKind")}</Label>
                <Select value={entryKind} onChange={(e) => setEntryKind(e.target.value as typeof entryKind)}>
                  {ENTRY_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{t(k.labelKey as never)}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("vendors.amount")} (JOD) *</Label>
                <Input required type="number" step="0.001" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.date")}</Label>
                <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {cfg.bank !== "none" && (
                <div className="space-y-1.5">
                  <Label>{t("vendors.account")} *</Label>
                  <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">—</option>
                    {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("common.notes")}</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" disabled={addEntry.isPending} className="w-full">
                  {addEntry.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {t("vendors.addEntry")}
                </Button>
              </div>
            </form>

            <div className="flex justify-end">
              <Button variant="outline" onClick={makePdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                {t("vendors.pdf")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-semibold " + (accent ? "text-primary" : "")}>{value}</div>
    </div>
  );
}
