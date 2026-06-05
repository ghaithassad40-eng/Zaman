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
import { formatJOD } from "@/lib/utils";
import type { Tables } from "@/types/database.types";

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

  return (
    <>
      <PageHeader
        title={t("purchases.title")}
        action={
          <Link href="/purchases/new" className={buttonVariants()}>
            <Plus className="size-4" /> {t("purchases.add")}
          </Link>
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
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={receive.isPending}
                          onClick={() => receive.mutate(p.id)}
                        >
                          {receive.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <PackageCheck className="size-4" />
                          )}
                          {t("purchases.receive")}
                        </Button>
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
