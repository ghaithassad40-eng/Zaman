// Flexible Excel/CSV bank-statement parser. Auto-maps common header layouts
// (JKB credit card "W/D", the app template, and generic Debit/Credit banks).
// CSV is parsed as text (day-first dates) to avoid spreadsheet mm/dd mis-coercion.
import * as XLSX from "xlsx";
import type { ParsedStatementLine } from "./etihad-statement";

const DATE_ALIASES = ["transaction date", "date", "trans date", "posting date", "txn date", "value date"];
const DESC_ALIASES = ["transaction details", "description", "details", "narrative", "particulars", "transaction"];
const OUT_ALIASES = ["w", "withdrawal", "withdrawal (out)", "withdrawals", "debit", "dr", "debit (out)", "out"];
const IN_ALIASES = ["d", "deposit", "deposit (in)", "deposits", "credit", "cr", "credit (in)", "in"];

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const k of Object.keys(row)) {
    if (aliases.includes(k.trim().toLowerCase())) {
      const v = row[k];
      if (v !== "" && v != null) return v;
    }
  }
  return undefined;
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Normalise many date encodings to YYYY-MM-DD (assumes day-first for d/m/y). */
export function parseLooseDate(input: unknown): string | null {
  if (input instanceof Date && !isNaN(input.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${input.getFullYear()}-${p(input.getMonth() + 1)}-${p(input.getDate())}`;
  }
  const s = String(input ?? "").trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/))) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; // day-first
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 70000) {
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === ",") { out.push(cur); cur = ""; }
    else if (c === '"') q = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}

function rowsFromCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const o: Record<string, unknown> = {};
    headers.forEach((h, i) => { o[h] = cells[i] ?? ""; });
    return o;
  });
}

async function rowsFromXlsx(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = wb.SheetNames.includes("Template") ? "Template" : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: "", raw: true });
}

export async function parseBankStatementFile(file: File): Promise<ParsedStatementLine[]> {
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
  const rows = isCsv ? rowsFromCsv(await file.text()) : await rowsFromXlsx(file);

  const out: ParsedStatementLine[] = [];
  for (const r of rows) {
    const date = parseLooseDate(pick(r, DATE_ALIASES));
    if (!date) continue;
    const desc = String(pick(r, DESC_ALIASES) ?? "").replace(/\s+/g, " ").trim();
    const w = num(pick(r, OUT_ALIASES));
    const d = num(pick(r, IN_ALIASES));
    let direction: "in" | "out";
    let amount: number;
    if (w > 0) { direction = "out"; amount = w; }
    else if (d > 0) { direction = "in"; amount = d; }
    else continue;
    out.push({ txn_date: date, description: desc || "—", amount, direction });
  }
  return out;
}
