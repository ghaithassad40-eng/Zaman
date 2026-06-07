"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { exportRowsToXlsx, type ExportCol } from "@/lib/xlsx-utils";

/** Drop-in Export-to-Excel button. Pass the rows currently visible on screen
 *  (so any filters / search already applied flow through) plus the column map
 *  and a base filename. */
export function ExportButton<T>({
  rows,
  cols,
  filename,
  size = "sm",
  label,
}: {
  rows: T[] | undefined;
  cols: ExportCol<T>[];
  filename: string;
  size?: "sm" | "default" | "lg";
  label?: string;
}) {
  const { t } = useI18n();
  const disabled = !rows || rows.length === 0;
  return (
    <Button
      variant="outline"
      size={size}
      disabled={disabled}
      onClick={() => rows && exportRowsToXlsx(filename, cols, rows)}
      title={label ?? t("common.exportExcel")}
    >
      <FileSpreadsheet className="size-4" />
      {label ?? t("common.exportExcel")}
    </Button>
  );
}
