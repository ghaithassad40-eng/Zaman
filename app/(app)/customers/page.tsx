"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users, Loader2, Pencil, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCustomers, useCompanySettings } from "@/lib/hooks";
import { downloadCustomerStatement } from "@/lib/statements";
import { PageHeader } from "@/components/page-header";
import { ExportButton } from "@/components/export-button";
import { SortableHead, useSort } from "@/components/ui/sortable-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { Tables } from "@/types/database.types";

type Customer = Tables<"customers">;
const emptyForm = { first_name: "", last_name: "", phone: "", instagram: "", address: "", city: "" };

export default function CustomersPage() {
  const { t } = useI18n();
  const { data, isLoading } = useCustomers();
  const sort = useSort<Customer>();
  const sorted = sort.applyTo(data, (c, k) => {
    switch (k) {
      case "name": return c.name;
      case "phone": return c.phone ?? "";
      case "ig": return c.instagram_handle ?? "";
      case "city": return c.city ?? "";
      default: return null;
    }
  });
  const { data: company } = useCompanySettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const supabase = createClient();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      phone: c.phone ?? "",
      instagram: c.instagram_handle ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        phone: form.phone.trim() || null,
        instagram_handle: form.instagram.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("customers.edit") : t("customers.add"));
      qc.invalidateQueries({ queryKey: ["customers"] });
      setForm(emptyForm);
      setEditing(null);
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove(c: Customer) {
    if (!window.confirm(t("customers.deleteConfirm"))) return;
    setBusy(c.id);
    try {
      const { count, error: cErr } = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", c.id)
        .is("deleted_at", null);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        toast.error(t("customers.hasTransactions"));
        return;
      }
      const { error } = await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
      if (error) throw error;
      toast.success(t("customers.deleted"));
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function statement(c: Customer) {
    setBusy(c.id);
    try {
      await downloadCustomerStatement({ customer: c, company: company ?? null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("customers.title")}
        action={
          <div className="flex items-center gap-2">
            <ExportButton
              filename="customers"
              rows={data}
              cols={[
                { header: "Name", accessor: (c) => c.name },
                { header: "Phone", accessor: (c) => c.phone ?? "" },
                { header: "Instagram", accessor: (c) => c.instagram_handle ?? "" },
                { header: "City", accessor: (c) => c.city ?? "" },
                { header: "Address", accessor: (c) => c.address ?? "" },
                { header: "Notes", accessor: (c) => c.notes ?? "" },
                { header: "Created", accessor: (c) => c.created_at?.slice(0, 10) ?? "" },
              ]}
            />
            <Button onClick={openAdd}>
              <Plus className="size-4" /> {t("customers.add")}
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data && data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="name" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("common.name")}</SortableHead>
                  <SortableHead sortKey="phone" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("common.phone")}</SortableHead>
                  <SortableHead sortKey="ig" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("customers.instagram")}</SortableHead>
                  <SortableHead sortKey="city" current={sort.sortKey} dir={sort.sortDir} onToggle={sort.toggle}>{t("customers.city")}</SortableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell dir="ltr" className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell dir="ltr" className="text-muted-foreground">{c.instagram_handle ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.city ?? "—"}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => statement(c)} title={t("customers.statement")}>
                          {busy === c.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                          <span className="hidden sm:inline">{t("customers.statement")}</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)} title={t("common.edit")}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy === c.id} onClick={() => remove(c)} title={t("common.delete")}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Users className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>{editing ? t("customers.edit") : t("customers.add")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label>{t("common.firstName")} *</Label>
              <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.lastName")} *</Label>
              <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("customers.instagram")}</Label>
              <Input dir="ltr" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("common.address")}</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("customers.city")}</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
