"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Loader2, Plus, ArrowRight, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
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
import type { Tables } from "@/types/database.types";

const CAT_LABEL: Record<string, string> = {
  cod_collected: "delivery.collected",
  delivery_fee: "delivery.fee",
  transfer: "delivery.transferred",
};

export default function DeliveryPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["delivery"],
    queryFn: async () => {
      const courier = (
        await supabase.from("accounts").select("*").eq("is_courier", true).is("deleted_at", null).limit(1).maybeSingle()
      ).data as Tables<"accounts"> | null;

      let txns: Tables<"cash_transactions">[] = [];
      if (courier) {
        txns = (
          await supabase.from("cash_transactions").select("*").eq("account_id", courier.id)
            .order("txn_date", { ascending: false }).order("created_at", { ascending: false })
        ).data ?? [];
      }
      const banks = (
        await supabase.from("accounts").select("id, name").eq("is_courier", false).is("deleted_at", null).order("created_at")
      ).data ?? [];
      return { courier, txns, banks };
    },
  });

  const courier = data?.courier;
  const balance = round3(
    Number(courier?.opening_balance ?? 0) +
      (data?.txns ?? []).reduce((s, x) => s + (x.direction === "in" ? Number(x.amount) : -Number(x.amount)), 0),
  );
  const collected = round3((data?.txns ?? []).filter((x) => x.category === "cod_collected").reduce((s, x) => s + Number(x.amount), 0));
  const fees = round3((data?.txns ?? []).filter((x) => x.category === "delivery_fee").reduce((s, x) => s + Number(x.amount), 0));

  if (isLoading) {
    return (<><PageHeader title={t("delivery.title")} /><Skeleton className="h-40" /></>);
  }

  if (!courier) {
    return (
      <>
        <PageHeader title={t("delivery.title")} description={t("delivery.subtitle")} />
        <CreateCourier onDone={() => qc.invalidateQueries({ queryKey: ["delivery"] })} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("delivery.title")}
        description={t("delivery.subtitle")}
        action={
          <Button onClick={() => setTransferOpen(true)}>
            <ArrowRight className="size-4" /> {t("delivery.recordTransfer")}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">{t("delivery.balanceOwed")}</div>
            <div className="text-2xl font-bold text-primary">{formatJOD(balance, locale)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{courier.name}</div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">{t("delivery.collected")}</div>
          <div className="text-xl font-bold">{formatJOD(collected, locale)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-sm text-muted-foreground">{t("delivery.fee")}</div>
          <div className="text-xl font-bold">{formatJOD(fees, locale)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4 font-semibold">{t("delivery.statement")}</div>
          {data && data.txns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("assets.category")}</TableHead>
                  <TableHead>{t("common.notes")}</TableHead>
                  <TableHead className="text-end">{t("banks.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.txns.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="text-muted-foreground">{x.txn_date}</TableCell>
                    <TableCell>{CAT_LABEL[x.category ?? ""] ? t(CAT_LABEL[x.category ?? ""] as never) : x.category}</TableCell>
                    <TableCell className="text-muted-foreground">{x.note ?? "—"}</TableCell>
                    <TableCell className={"text-end font-medium " + (x.direction === "in" ? "text-success" : "text-destructive")}>
                      <span className="inline-flex items-center gap-1">
                        {x.direction === "in" ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        {formatJOD(x.amount, locale)}
                      </span>
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

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        courierId={courier.id}
        banks={data?.banks ?? []}
        maxBalance={balance}
      />
    </>
  );
}

function CreateCourier({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounts").insert({
        name: name.trim() || "Delivery Company",
        type: "bank",
        is_courier: true,
        is_default: false,
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("delivery.createCourier")); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
      <Truck className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t("delivery.noCourier")}</p>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="flex w-full max-w-sm gap-2">
        <Input placeholder={t("delivery.courierName")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("delivery.createCourier")}
        </Button>
      </form>
    </div>
  );
}

function TransferDialog({ open, onClose, courierId, banks, maxBalance }: {
  open: boolean; onClose: () => void; courierId: string; banks: { id: string; name: string }[]; maxBalance: number;
}) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const transfer = useMutation({
    mutationFn: async () => {
      const amt = Number(amount) || 0;
      if (amt <= 0) throw new Error("Enter an amount");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      // Out of courier…
      const { error: e1 } = await supabase.from("cash_transactions").insert({
        account_id: courierId, direction: "out", amount: amt, category: "transfer",
        txn_date: date, note: "Transfer to account", created_by: uid,
      });
      if (e1) throw e1;
      // …into the chosen bank/cash account.
      if (toAccount) {
        const { error: e2 } = await supabase.from("cash_transactions").insert({
          account_id: toAccount, direction: "in", amount: amt, category: "transfer",
          txn_date: date, note: "Transfer from courier", created_by: uid,
        });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(t("delivery.transfer"));
      qc.invalidateQueries({ queryKey: ["delivery"] });
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setAmount(""); setToAccount("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("delivery.recordTransfer")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); transfer.mutate(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("delivery.transferAmount")} (JOD) *</Label>
            <Input required type="number" step="0.001" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("delivery.balanceOwed")}: {maxBalance.toFixed(3)} JOD</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("delivery.toAccount")}</Label>
            <Select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="">—</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={transfer.isPending}>
              {transfer.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("delivery.transfer")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
