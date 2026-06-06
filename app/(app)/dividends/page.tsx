"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins, Loader2, Plus, Trash2, CheckCircle2, BadgeCheck, Wallet, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatJOD, round3 } from "@/lib/utils";

type Share = {
  id: string;
  dividend_id: string;
  partner_id: string;
  pct: number;
  amount: number;
  paid: boolean;
  paid_on: string | null;
  confirmed: boolean;
  confirmed_on: string | null;
  account_id: string | null;
  partners: { full_name: string; name_ar: string | null } | null;
  accounts: { name: string } | null;
};
type Dividend = { id: string; declared_on: string; total_amount: number; note: string | null; status: string };

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function DividendsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [declareOpen, setDeclareOpen] = useState(false);
  const [payShare, setPayShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dividends"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const me = (await supabase.from("partners").select("id, is_admin").eq("user_id", userData.user?.id ?? "").maybeSingle()).data;
      const dividends = (await supabase.from("dividends").select("*").order("declared_on", { ascending: false }).order("created_at", { ascending: false })).data ?? [];
      const shares = (await supabase
        .from("dividend_shares")
        .select("id, dividend_id, partner_id, pct, amount, paid, paid_on, confirmed, confirmed_on, account_id, partners(full_name, name_ar), accounts(name)")
        .order("created_at")).data ?? [];
      const accounts = (await supabase.from("accounts").select("id, name").eq("is_courier", false).is("deleted_at", null).order("created_at")).data ?? [];
      const fin = (await supabase.rpc("get_financials", { p_from: "2000-01-01", p_to: "2999-12-31" })).data as { balance_sheet?: { retained_earnings?: number } } | null;
      return { me, dividends: dividends as Dividend[], shares: shares as unknown as Share[], accounts, retained: Number(fin?.balance_sheet?.retained_earnings ?? 0) };
    },
  });

  const me = data?.me;
  const isAdmin = !!me?.is_admin;

  const confirmShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("confirm_dividend_share", { p_share_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("div.confirmed")); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function removeDividend(d: Dividend) {
    if (!window.confirm(t("div.deleteConfirm"))) return;
    setBusy(d.id);
    try {
      const { error } = await supabase.rpc("delete_dividend", { p_id: d.id });
      if (error) throw error;
      toast.success(t("div.deleted"));
      qc.invalidateQueries({ queryKey: ["dividends"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const sharesFor = (id: string) => (data?.shares ?? []).filter((s) => s.dividend_id === id);
  const nm = (s: Share) => (locale === "ar" && s.partners?.name_ar ? s.partners.name_ar : s.partners?.full_name ?? "—");

  return (
    <>
      <PageHeader
        title={t("div.title")}
        description={t("div.subtitle")}
        action={
          isAdmin ? (
            <Button onClick={() => setDeclareOpen(true)}>
              <Plus className="size-4" /> {t("div.declare")}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="text-sm text-muted-foreground">{t("div.distributable")}</div>
                <div className="text-2xl font-bold text-primary">{formatJOD(data?.retained ?? 0, locale)}</div>
              </div>
              <HandCoins className="size-8 text-primary/60" />
            </CardContent>
          </Card>

          {(data?.dividends.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
              <HandCoins className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("div.noDist")}</p>
            </div>
          ) : (
            data!.dividends.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                    <div className="flex items-center gap-3">
                      <Badge variant={d.status === "completed" ? "success" : d.status === "paid" ? "secondary" : "warning"}>
                        {d.status === "completed" ? t("div.completed") : d.status === "paid" ? t("div.paid") : t("div.declared")}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{d.declared_on}</span>
                      {d.note && <span className="text-sm text-muted-foreground">· {d.note}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{formatJOD(d.total_amount, locale)}</span>
                      {isAdmin && d.status === "declared" && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy === d.id} onClick={() => removeDividend(d)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("div.owner")}</TableHead>
                        <TableHead className="text-end">{t("div.share")}</TableHead>
                        <TableHead className="text-end">{t("div.amount")}</TableHead>
                        <TableHead className="text-end">{t("div.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sharesFor(d.id).map((s) => {
                        const mine = me?.id === s.partner_id;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">
                              {nm(s)}
                              {mine && <span className="ms-2 text-xs text-primary">({locale === "ar" ? "أنت" : "you"})</span>}
                            </TableCell>
                            <TableCell className="text-end">{s.pct}%</TableCell>
                            <TableCell className="text-end font-medium">{formatJOD(s.amount, locale)}</TableCell>
                            <TableCell className="text-end">
                              <div className="flex items-center justify-end gap-2">
                                {s.confirmed ? (
                                  <Badge variant="success" className="gap-1"><BadgeCheck className="size-3.5" /> {t("div.confirmed")}</Badge>
                                ) : s.paid ? (
                                  mine ? (
                                    <Button size="sm" onClick={() => confirmShare.mutate(s.id)} disabled={confirmShare.isPending}>
                                      {confirmShare.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                                      {t("div.confirm")}
                                    </Button>
                                  ) : (
                                    <Badge variant="secondary" className="gap-1"><Clock className="size-3.5" /> {t("div.awaitingConfirm")}</Badge>
                                  )
                                ) : isAdmin ? (
                                  <Button size="sm" variant="outline" onClick={() => setPayShare(s)}>
                                    <Wallet className="size-4" /> {t("div.pay")}
                                  </Button>
                                ) : (
                                  <Badge variant="warning" className="gap-1"><Clock className="size-3.5" /> {t("div.awaitingPay")}</Badge>
                                )}
                              </div>
                              {s.paid && s.paid_on && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {t("div.paidOn")} {s.paid_on}{s.accounts?.name ? ` · ${s.accounts.name}` : ""}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <DeclareDialog open={declareOpen} onClose={() => setDeclareOpen(false)} retained={data?.retained ?? 0} />
      <PayDialog share={payShare} accounts={data?.accounts ?? []} onClose={() => setPayShare(null)} />
    </>
  );
}

function DeclareDialog({ open, onClose, retained }: { open: boolean; onClose: () => void; retained: number }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");

  const declare = useMutation({
    mutationFn: async () => {
      const amt = round3(Number(total) || 0);
      if (amt <= 0) throw new Error("Enter an amount");
      const { error } = await supabase.rpc("declare_dividend", { p_total: amt, p_date: date, p_note: note });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("div.declare"));
      qc.invalidateQueries({ queryKey: ["dividends"] });
      setTotal(""); setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader><DialogTitle>{t("div.declare")}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); declare.mutate(); }} className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">{t("div.distributable")}: </span>
            <span className="font-semibold">{formatJOD(retained, locale)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("div.totalAmount")} (JOD) *</Label>
              <Input required type="number" step="0.001" dir="ltr" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("div.declaredOn")}</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{t("div.preview")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={declare.isPending}>
              {declare.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("div.declare")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ share, accounts, onClose }: { share: Share | null; accounts: { id: string; name: string }[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(todayIso());

  const pay = useMutation({
    mutationFn: async () => {
      if (!share) return;
      if (!account) throw new Error("Choose an account");
      const { error } = await supabase.rpc("pay_dividend_share", { p_share_id: share.id, p_account_id: account, p_date: date });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("div.paid"));
      qc.invalidateQueries();
      setAccount("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!share} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader><DialogTitle>{t("div.pay")}</DialogTitle></DialogHeader>
        {share && (
          <form onSubmit={(e) => { e.preventDefault(); pay.mutate(); }} className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("div.owner")}</span><span className="font-medium">{locale === "ar" && share.partners?.name_ar ? share.partners.name_ar : share.partners?.full_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("div.amount")}</span><span className="font-bold">{formatJOD(share.amount, locale)}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("div.payFrom")} *</Label>
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">—</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.date")}</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={pay.isPending}>
                {pay.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("div.pay")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
