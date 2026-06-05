import * as XLSX from "xlsx";

export type Col = { key: string; header: string; example?: string | number };

/** Build and download an .xlsx template: a "Template" sheet (headers only) plus
 *  an "Example" sheet with sample rows for reference. */
export function downloadTemplate(filename: string, cols: Col[], examples: Record<string, unknown>[] = []) {
  const headers = cols.map((c) => c.header);
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(12, c.header.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Template");

  if (examples.length) {
    const exRows = examples.map((e) => cols.map((c) => (e[c.key] as string | number | undefined) ?? ""));
    const exWs = XLSX.utils.aoa_to_sheet([headers, ...exRows]);
    exWs["!cols"] = cols.map((c) => ({ wch: Math.max(12, c.header.length + 2) }));
    XLSX.utils.book_append_sheet(wb, exWs, "Example");
  }

  XLSX.writeFile(wb, filename);
}

/** Parse an uploaded spreadsheet into objects keyed by Col.key (matching the
 *  template headers, case-insensitively). Empty rows are dropped. */
export async function parseUpload(file: File, cols: Col[]): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheetName = wb.SheetNames.includes("Template") ? "Template" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const headerToKey = new Map(cols.map((c) => [c.header.trim().toLowerCase(), c.key]));
  return raw
    .map((r) => {
      const out: Record<string, string> = {};
      for (const [h, v] of Object.entries(r)) {
        const key = headerToKey.get(String(h).trim().toLowerCase());
        if (key) out[key] = String(v ?? "").trim();
      }
      return out;
    })
    .filter((r) => Object.values(r).some((v) => v !== ""));
}

export const numOr = (v: string | undefined, d = 0) => {
  const n = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : d;
};
