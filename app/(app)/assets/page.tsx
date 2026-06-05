"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Package, Printer, Box, Gift, Tag, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { useCompanySettings } from "@/lib/hooks";
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
import { formatJOD, num3, round3 } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

const CATEGORY_ICON: Record<string, React.ElementType> = {
  box: Box,
  bag: ShoppingBag,
  label: Tag,
  gift: Gift,
  printer: Printer,
};

function perParcelShare(a: Tables<"packaging_assets">): number {
  if (a.kind === "consumable" && a.qty_purchased > 0)
    return round3((Number(a.purchase_cost) / a.qty_purchased) * a.qty_per_order);
  if (a.kind === "equipment" && a.expected_uses && a.expected_uses > 0)
    return round3((Number(a.purchase_cost) / a.expected_uses) * a.qty_per_order);
  return 0;
}

export default function AssetsPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const { data: settings } = useCompanySettings();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["packaging_assets"],
    queryFn: async (): Promise<Tables<"packaging_assets">[]> => {
      const { data, error } = await supabase
        .from("packaging_assets")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title={t("assets.title")}
        description={t("assets.subtitle")}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> {t("assets.add")}
          </Button>
        }
      />

      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="text-sm text-muted-foreground">{t("assets.perOrderCost")}</div>
            <div className="text-2xl font-bold text-primary">
              {formatJOD(settings?.packaging_cost_per_order ?? 0, locale)}
            </div>
          </div>
          <p className="max-w-xs text-xs text-muted-foreground">{t("assets.perOrderCostHint")}</p>
        </CardContent>
      </Card>

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
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("assets.kind")}</TableHead>
                  <TableHead className="text-end">{t("assets.unitCost")}</TableHead>
                  <TableHead className="text-end">{t("assets.qtyRemaining")}</TableHead>
                  <TableHead className="text-end">{t("assets.contribution")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((a) => {
                  const Icon = CATEGORY_ICON[a.category ?? ""] ?? Package;
                  const unit =
                    a.kind === "consumable" && a.qty_purchased > 0
                      ? Number(a.purchase_cost) / a.qty_purchased
                      : a.kind === "equipment" && a.expected_uses
                        ? Number(a.purchase_cost) / a.expected_uses
                        : 0;
                  const low = a.kind === "consumable" && (a.qty_remaining ?? 0) <= 5;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <div className="font-medium">{locale === "ar" && a.name_ar ? a.name_ar : a.name}</div>
                            {a.category && <div className="text-xs text-muted-foreground">{a.category}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.kind === "equipment" ? "secondary" : "default"}>
                          {t(a.kind === "equipment" ? "assets.equipment" : "assets.consumable")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end text-muted-foreground">{num3(unit)}</TableCell>
                      <TableCell className="text-end">
                        {a.kind === "consumable" ? (
                          <Badge variant={low ? "warning" : "success"}>{a.qty_remaining ?? 0}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-end font-medium">
                        {formatJOD(perParcelShare(a), locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Package className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
              <Button onClick={() => setOpen(true)} variant="outline">
                <Plus className="size-4" /> {t("assets.add")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AssetDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AssetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const supabase = createClient();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    kind: "consumable" as "consumable" | "equipment",
    category: "box",
    purchase_cost: "",
    qty_purchased: "1",
    expected_uses: "",
    qty_per_order: "1",
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const isConsumable = form.kind === "consumable";
      const qtyPurchased = Number(form.qty_purchased) || 1;
      const { error } = await supabase.from("packaging_assets").insert({
        name: form.name.trim(),
        kind: form.kind,
        category: form.category,
        purchase_cost: Number(form.purchase_cost) || 0,
        qty_purchased: isConsumable ? qtyPurchased : 1,
        qty_remaining: isConsumable ? qtyPurchased : null,
        expected_uses: !isConsumable ? Number(form.expected_uses) || null : null,
        qty_per_order: Number(form.qty_per_order) || 1,
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("assets.add"));
      qc.invalidateQueries({ queryKey: ["packaging_assets"] });
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      qc.invalidateQueries({ queryKey: ["banks"] });
      setForm({ name: "", kind: "consumable", category: "box", purchase_cost: "", qty_purchased: "1", expected_uses: "", qty_per_order: "1" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isEquipment = form.kind === "equipment";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{t("assets.add")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="grid grid-cols-2 gap-4"
        >
          <div className="col-span-2 space-y-1.5">
            <Label>{t("common.name")} *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("assets.kind")}</Label>
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "consumable" | "equipment" })}>
              <option value="consumable">{t("assets.consumable")}</option>
              <option value="equipment">{t("assets.equipment")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("assets.category")}</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="box">Box</option>
              <option value="bag">Bag</option>
              <option value="label">Label</option>
              <option value="gift">Gift</option>
              <option value="printer">Printer</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("assets.purchaseCost")} (JOD) *</Label>
            <Input required type="number" step="0.001" dir="ltr" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} />
          </div>
          {isEquipment ? (
            <div className="space-y-1.5">
              <Label>{t("assets.expectedUses")} *</Label>
              <Input required type="number" dir="ltr" placeholder="5000" value={form.expected_uses} onChange={(e) => setForm({ ...form, expected_uses: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("assets.qtyPurchased")} *</Label>
              <Input required type="number" dir="ltr" value={form.qty_purchased} onChange={(e) => setForm({ ...form, qty_purchased: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5 col-span-2">
            <Label>{t("assets.perOrder")}</Label>
            <Input type="number" dir="ltr" value={form.qty_per_order} onChange={(e) => setForm({ ...form, qty_per_order: e.target.value })} />
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
