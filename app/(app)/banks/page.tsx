"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Landmark, Wallet, Banknote, Star, ArrowDownLeft, ArrowUpRight, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type AccountWithTxns = Tables<"accounts"> & {
  cash_transactions: { direction: "in" | "out"; amount: number }[];
};

const TYPE_ICON = { cash: Banknote, bank: Landmark, wallet: Wallet } as const;

function expectedBalance(a: AccountWithTxns): number {
  const net = (a.cash_transactions ?? []).reduce(
    (s, x) => s + (x.direction === "in" ? Number(x.amount) : -Number(x.amount)),
    0,
  );
  return round3(Number(a.opening_balance) + net);
}

export default function BanksPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [addAcc, setAddAcc] = useState(false);
  const [txnAcc, setTxnAcc] = useState<string | null>(null);
  const [editAcc, setEditAcc] = useState<AccountWithTxns | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const [accs, txns] = await Promise.all([
        supabase.from("accounts").select("*, cash_transactions(direction, amount)").eq("is_courier", false).is("deleted_at", null).order("created_at"),
        supabase
          .from("cash_transactions")
          .select("*, accounts(name)")
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      if (accs.error) throw accs.error;
      return {
        accounts: (accs.data ?? []) as unknown as AccountWithTxns[],
        recent: (txns.data ?? []) as unknown as (Tables<"cash_transactions"> & { accounts: { name: string } | null })[],
      };
    },
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("accounts").update({ is_default: false }).eq("is_default", true);
      const { error } = await supabase.from("accounts").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("banks.default"));
      qc.invalidateQueries({ queryKey: ["banks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalExpected = round3((data?.accounts ?? []).reduce((s, a) => s + expectedBalance(a), 0));

  return (
    <>
      <PageHeader
        title={t("banks.title")}
        description={t("banks.subtitle")}
        action={
          <Button onClick={() => setAddAcc(true)}>
            <Plus className="size-4" /> {t("banks.addAccount")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : data && data.accounts.length > 0 ? (
        <>
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">{t("banks.expectedTotal")}</div>
              <div className="text-3xl font-bold text-primary">{formatJOD(totalExpected, locale)}</div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.accounts.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? Landmark;
              return (
                <Card key={a.id}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div>
                          <div className="font-semibold">{locale === "ar" && a.name_ar ? a.name_ar : a.name}</div>
                          <div className="text-xs text-muted-foreground">{t(`banks.${a.type}`)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.is_default ? (
                          <Badge><Star className="me-1 size-3" />{t("banks.default")}</Badge>
                        ) : (
                          <button onClick={() => setDefault.mutate(a.id)} className="text-xs text-muted-foreground hover:text-primary">
                            {t("banks.setDefault")}
                          </button>
                        )}
                        <button onClick={() => setEditAcc(a)} className="text-muted-foreground hover:text-primary" title={t("common.edit")}>
                          <Pencil className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">{t("banks.expectedBalance")}</div>
                      <div className="text-2xl font-bold">{formatJOD(expectedBalance(a), locale)}</div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setTxnAcc(a.id)}>
                      <Plus className="size-4" /> {t("banks.addTxn")}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent transactions */}
          <Card className="mt-6">
            <CardContent className="p-0">
              <div className="border-b p-4 font-semibold">{t("banks.transactions")}</div>
              {data.recent.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("banks.account")}</TableHead>
                      <TableHead>{t("assets.category")}</TableHead>
                      <TableHead className="text-end">{t("banks.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell className="text-muted-foreground">{x.txn_date}</TableCell>
                        <TableCell>{x.accounts?.name ?? "—"}</TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{x.category ?? "—"}</span>
                          {x.note && <span className="ms-1 text-xs text-muted-foreground">· {x.note}</span>}
                        </TableCell>
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
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Landmark className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("banks.noAccounts")}</p>
          <Button onClick={() => setAddAcc(true)} variant="outline">
            <Plus className="size-4" /> {t("banks.addAccount")}
          </Button>
        </div>
      )}

      <AddAccountDialog open={addAcc} onClose={() => setAddAcc(false)} hasAccounts={(data?.accounts.length ?? 0) > 0} />
      <AddTxnDialog accountId={txnAcc} onClose={() => setTxnAcc(null)} />
      <EditAccountDialog account={editAcc} onClose={() => setEditAcc(null)} />
    </>
  );
}

function AddAccountDialog({ open, onClose, hasAccounts }: { open: boolean; onClose: () => void; hasAccounts: boolean }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", type: "bank", opening_balance: "0" });

  const add = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounts").insert({
        name: form.name.trim(),
        type: form.type as "cash" | "bank" | "wallet",
        opening_balance: Number(form.opening_balance) || 0,
        is_default: !hasAccounts, // first account becomes default
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("banks.addAccount"));
      qc.invalidateQueries({ queryKey: ["banks"] });
      setForm({ name: "", type: "bank", opening_balance: "0" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("banks.addAccount")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>{t("common.name")} *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CliQ / Arab Bank / Cash" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("banks.type")}</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="bank">{t("banks.bank")}</option>
              <option value="cash">{t("banks.cash")}</option>
              <option value="wallet">{t("banks.wallet")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("banks.openingBalance")}</Label>
            <Input type="number" step="0.001" dir="ltr" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddTxnDialog({ accountId, onClose }: { accountId: string | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({ direction: "out", amount: "", category: "expense", note: "", date: new Date().toISOString().slice(0, 10), partner_id: "" });

  const { data: partners } = useQuery({
    queryKey: ["partners-min"],
    queryFn: async (): Promise<Tables<"partners">[]> => {
      const { data } = await supabase.from("partners").select("*").is("deleted_at", null).order("created_at");
      return data ?? [];
    },
  });

  const isPartnerTxn = form.category === "capital" || form.category === "drawing";

  const add = useMutation({
    mutationFn: async () => {
      if (!accountId) return;
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("cash_transactions").insert({
        account_id: accountId,
        direction: form.direction as "in" | "out",
        amount: Number(form.amount) || 0,
        category: form.category,
        partner_id: isPartnerTxn ? form.partner_id || null : null,
        note: form.note.trim() || null,
        txn_date: form.date,
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("banks.addTxn"));
      qc.invalidateQueries({ queryKey: ["banks"] });
      setForm({ direction: "out", amount: "", category: "expense", note: "", date: new Date().toISOString().slice(0, 10), partner_id: "" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!accountId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("banks.addTxn")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t("banks.type")}</Label>
            <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              <option value="out">{t("banks.moneyOut")}</option>
              <option value="in">{t("banks.moneyIn")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("banks.amount")} (JOD) *</Label>
            <Input required type="number" step="0.001" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("assets.category")}</Label>
            <Select
              value={form.category}
              onChange={(e) => {
                const c = e.target.value;
                const outCats = ["drawing", "withdrawal", "expense", "fee", "marketing"];
                const dir = c === "capital" || c === "deposit" ? "in" : outCats.includes(c) ? "out" : form.direction;
                setForm({ ...form, category: c, direction: dir });
              }}
            >
              <option value="expense">Expense</option>
              <option value="marketing">Marketing / Ads (Instagram)</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="fee">Fee</option>
              <option value="capital">Partner capital (in)</option>
              <option value="drawing">Partner drawing (out)</option>
              <option value="adjustment">Adjustment</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Input type="date" dir="ltr" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          {isPartnerTxn && (
            <div className="col-span-2 space-y-1.5">
              <Label>{t("reports.partner")} *</Label>
              <Select required value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}>
                <option value="">—</option>
                {(partners ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{locale === "ar" && p.name_ar ? p.name_ar : p.full_name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="col-span-2 space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({ account, onClose }: { account: AccountWithTxns | null; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", type: "bank", opening_balance: "0", is_default: false });

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name,
        type: account.type,
        opening_balance: String(account.opening_balance),
        is_default: account.is_default,
      });
    }
  }, [account]);

  const save = useMutation({
    mutationFn: async () => {
      if (!account) return;
      // Promote to default → clear any other default first.
      if (form.is_default && !account.is_default) {
        await supabase.from("accounts").update({ is_default: false }).eq("is_default", true);
      }
      const { error } = await supabase
        .from("accounts")
        .update({
          name: form.name.trim(),
          type: form.type as "cash" | "bank" | "wallet",
          opening_balance: Number(form.opening_balance) || 0,
          is_default: form.is_default,
        })
        .eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      qc.invalidateQueries({ queryKey: ["banks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("common.edit")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>{t("common.name")} *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("banks.type")}</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="bank">{t("banks.bank")}</option>
              <option value="cash">{t("banks.cash")}</option>
              <option value="wallet">{t("banks.wallet")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("banks.openingBalance")}</Label>
            <Input type="number" step="0.001" dir="ltr" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            {t("banks.setDefault")}
          </label>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
