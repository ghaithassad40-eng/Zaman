"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Landmark, Wallet, Banknote, Star, ArrowDownLeft, ArrowUpRight, Pencil, Scale, Link2, Check, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { downloadTemplate, type Col } from "@/lib/xlsx-utils";
import { parseEtihadStatement, type ParsedStatementLine } from "@/lib/etihad-statement";
import { parseBankStatementFile } from "@/lib/bank-statement";
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
  const [reconcileAcc, setReconcileAcc] = useState<AccountWithTxns | null>(null);

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
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => setTxnAcc(a.id)}>
                        <Plus className="size-4" /> {t("banks.addTxn")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setReconcileAcc(a)}>
                        <Scale className="size-4" /> {t("banks.reconcile")}
                      </Button>
                    </div>
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
      <ReconcileDialog account={reconcileAcc} onClose={() => setReconcileAcc(null)} />
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

const STMT_COLS: Col[] = [
  { key: "date", header: "Date (YYYY-MM-DD)" },
  { key: "description", header: "Description" },
  { key: "withdrawal", header: "Withdrawal (out)" },
  { key: "deposit", header: "Deposit (in)" },
];
const STMT_EXAMPLE = [
  { date: "2026-06-01", description: "Shein purchase payment", withdrawal: 120, deposit: "" },
  { date: "2026-06-03", description: "Customer COD deposit", withdrawal: "", deposit: 45 },
];

type StmtLine = Tables<"bank_statement_lines">;
type SysTxn = Pick<Tables<"cash_transactions">, "id" | "txn_date" | "amount" | "direction" | "category" | "note" | "reconciled" | "statement_line_id">;

function ReconcileDialog({ account, onClose }: { account: AccountWithTxns | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const accId = account?.id ?? null;
  const [selLine, setSelLine] = useState<string | null>(null);
  const [selTxn, setSelTxn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reconcile", accId],
    enabled: !!accId,
    queryFn: async () => {
      const lines = (await supabase.from("bank_statement_lines").select("*").eq("account_id", accId!).order("txn_date")).data ?? [];
      const txns = (await supabase.from("cash_transactions")
        .select("id, txn_date, amount, direction, category, note, reconciled, statement_line_id")
        .eq("account_id", accId!).order("txn_date", { ascending: false })).data ?? [];
      return { lines: lines as StmtLine[], txns: txns as SysTxn[] };
    },
  });

  const lines = data?.lines ?? [];
  const txns = data?.txns ?? [];
  const signed = (dir: string, amt: number) => (dir === "in" ? amt : -amt);
  const stmtNet = round3(lines.reduce((s, l) => s + signed(l.direction, Number(l.amount)), 0));
  const reconNet = round3(txns.filter((x) => x.reconciled).reduce((s, x) => s + signed(x.direction, Number(x.amount)), 0));
  const diff = round3(stmtNet - reconNet);
  const matchedCount = lines.filter((l) => l.matched).length;

  const refetch = () => qc.invalidateQueries({ queryKey: ["reconcile", accId] });

  async function insertLines(parsed: ParsedStatementLine[]) {
    if (parsed.length === 0) throw new Error("No transactions found in this file");
    const { data: userData } = await supabase.auth.getUser();
    const seen = new Set(lines.map((l) => `${l.txn_date}|${Number(l.amount)}|${l.direction}|${l.description ?? ""}`));
    const toInsert = parsed
      .filter((p) => !seen.has(`${p.txn_date}|${p.amount}|${p.direction}|${p.description}`))
      .map((p) => ({ account_id: accId!, txn_date: p.txn_date, description: p.description, amount: round3(p.amount), direction: p.direction, created_by: userData.user?.id }));
    if (toInsert.length === 0) throw new Error("All lines already imported");
    const { error } = await supabase.from("bank_statement_lines").insert(toInsert);
    if (error) throw error;
    refetch();
    toast.success(`${toInsert.length} ${t("banks.imported")}`);
  }

  async function importPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accId) return;
    setPdfBusy(true);
    try { await insertLines(await parseEtihadStatement(file)); }
    catch (err) { toast.error((err as Error).message); }
    finally { setPdfBusy(false); }
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accId) return;
    setBusy(true);
    try { await insertLines(await parseBankStatementFile(file)); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function match() {
    if (!selLine || !selTxn) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("match_bank_line", { p_line: selLine, p_txn: selTxn });
      if (error) throw error;
      setSelLine(null); setSelTxn(null);
      refetch();
      qc.invalidateQueries({ queryKey: ["banks"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function unmatch(lineId: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("unmatch_bank_line", { p_line: lineId });
      if (error) throw error;
      refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function autoMatch() {
    setBusy(true);
    try {
      const freeTxns = txns.filter((x) => !x.reconciled);
      const used = new Set<string>();
      let n = 0;
      for (const l of lines.filter((x) => !x.matched)) {
        const hit = freeTxns.find((x) => !used.has(x.id) && x.direction === l.direction && Math.abs(Number(x.amount) - Number(l.amount)) < 0.001);
        if (hit) {
          const { error } = await supabase.rpc("match_bank_line", { p_line: l.id, p_txn: hit.id });
          if (!error) { used.add(hit.id); n++; }
        }
      }
      refetch();
      qc.invalidateQueries({ queryKey: ["banks"] });
      toast.success(`${n} ${t("banks.matchedCount")}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function clearUnmatched() {
    setBusy(true);
    try {
      const { error } = await supabase.from("bank_statement_lines").delete().eq("account_id", accId!).eq("matched", false);
      if (error) throw error;
      refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const money = (n: number) => formatJOD(n, locale);
  const txnLabel = (x: SysTxn) => [x.category, x.note].filter(Boolean).join(" · ") || "—";

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("banks.reconcileTitle")} · {account?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary + tools */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap gap-5">
              <div><div className="text-xs text-muted-foreground">{t("banks.statementTotal")}</div><div className="font-semibold">{money(stmtNet)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("banks.clearedTotal")}</div><div className="font-semibold">{money(reconNet)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("banks.difference")}</div><div className={"font-semibold " + (Math.abs(diff) < 0.001 ? "text-success" : "text-destructive")}>{money(diff)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("banks.matchedTab")}</div><div className="font-semibold">{matchedCount}/{lines.length}</div></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={importPdf} />
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={importFile} />
              <Button size="sm" variant="outline" onClick={() => pdfInputRef.current?.click()} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} {t("banks.uploadPdf")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <FileText className="size-4" /> {t("banks.uploadCsv")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadTemplate("zaman-bank-statement.xlsx", STMT_COLS, STMT_EXAMPLE)}>
                {t("banks.template")}
              </Button>
              {lines.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={autoMatch} disabled={busy}><Link2 className="size-4" /> {t("banks.autoMatch")}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={clearUnmatched} disabled={busy}><Trash2 className="size-4" /></Button>
                </>
              )}
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-64" />
          ) : lines.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">{t("banks.noStatement")}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Bank statement lines */}
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 p-2.5 text-sm font-semibold">{t("banks.statementLines")}</div>
                  <div className="max-h-72 divide-y overflow-y-auto">
                    {lines.map((l) => (
                      <div key={l.id} className={"flex items-center gap-2 p-2.5 text-sm " + (l.matched ? "bg-success/5" : selLine === l.id ? "bg-primary/5" : "")}>
                        {l.matched ? (
                          <button onClick={() => unmatch(l.id)} title={t("banks.unmatch")} className="text-success hover:text-destructive"><Check className="size-4" /></button>
                        ) : (
                          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selLine === l.id} onChange={() => setSelLine(selLine === l.id ? null : l.id)} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{l.description ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{l.txn_date}</div>
                        </div>
                        <div className={"font-medium " + (l.direction === "in" ? "text-success" : "text-destructive")}>
                          {l.direction === "in" ? "+" : "−"}{money(Number(l.amount))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* System transactions */}
                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 p-2.5 text-sm font-semibold">{t("banks.systemTxns")}</div>
                  <div className="max-h-72 divide-y overflow-y-auto">
                    {txns.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground">{t("common.empty")}</div>
                    ) : txns.map((x) => (
                      <div key={x.id} className={"flex items-center gap-2 p-2.5 text-sm " + (x.reconciled ? "bg-success/5" : selTxn === x.id ? "bg-primary/5" : "")}>
                        {x.reconciled ? (
                          <Check className="size-4 text-success" />
                        ) : (
                          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selTxn === x.id} onChange={() => setSelTxn(selTxn === x.id ? null : x.id)} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{txnLabel(x)}</div>
                          <div className="text-xs text-muted-foreground">{x.txn_date}</div>
                        </div>
                        <div className={"font-medium " + (x.direction === "in" ? "text-success" : "text-destructive")}>
                          {x.direction === "in" ? "+" : "−"}{money(Number(x.amount))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{t("banks.pickOneEach")}</p>
                <Button onClick={match} disabled={!selLine || !selTxn || busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                  {t("banks.match")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
