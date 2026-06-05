"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
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

type Row = {
  qty_on_hand: number;
  avg_unit_cost: number;
  products: { name: string; sku: string } | null;
};

export default function InventoryPage() {
  const { t, locale } = useI18n();
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("inventory")
        .select("qty_on_hand, avg_unit_cost, products(name, sku)")
        .order("qty_on_hand", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const totalValue = round3(
    (data ?? []).reduce((s, r) => s + Number(r.qty_on_hand) * Number(r.avg_unit_cost), 0),
  );

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        (r.products?.name ?? "").toLowerCase().includes(q) ||
        (r.products?.name ?? "").includes(search.trim()) ||
        (r.products?.sku ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <>
      <PageHeader
        title={t("nav.inventory")}
        description={`${t("dashboard.stockValue")}: ${formatJOD(totalValue, locale)}`}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("products.sku")}</TableHead>
                  <TableHead className="text-end">{t("products.onHand")}</TableHead>
                  <TableHead className="text-end">{t("products.avgCost")}</TableHead>
                  <TableHead className="text-end">{t("dashboard.stockValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.products?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.products?.sku ?? "—"}</TableCell>
                    <TableCell className="text-end">
                      <Badge variant={r.qty_on_hand > 2 ? "success" : r.qty_on_hand > 0 ? "warning" : "secondary"}>
                        {r.qty_on_hand}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatJOD(r.avg_unit_cost, locale)}
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {formatJOD(round3(r.qty_on_hand * r.avg_unit_cost), locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Boxes className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
