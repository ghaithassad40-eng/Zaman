"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { downloadTemplate, parseUpload, type Col } from "@/lib/xlsx-utils";

export type ImportResult = { created: number; skipped?: number; errors?: string[] };

export function ImportControls({
  templateName,
  cols,
  examples,
  onImport,
  size = "default",
}: {
  templateName: string;
  cols: Col[];
  examples?: Record<string, unknown>[];
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
  size?: "default" | "sm";
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const rows = await parseUpload(file, cols);
      if (rows.length === 0) {
        toast.error(t("common.noDataInFile"));
        return;
      }
      const res = await onImport(rows);
      const parts = [`${res.created} ${t("import.created")}`];
      if (res.skipped) parts.push(`${res.skipped} ${t("import.skipped")}`);
      toast.success(parts.join(" · "));
      if (res.errors?.length) toast.error(res.errors.slice(0, 3).join(" | "));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size={size} onClick={() => downloadTemplate(templateName, cols, examples)}>
        <Download className="size-4" /> {t("import.template")}
      </Button>
      <Button type="button" variant="outline" size={size} disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {t("import.upload")}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
