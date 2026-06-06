// Parse a Bank al Etihad "Account Statement" PDF into reconciliation lines.
// pdf.js is loaded from CDN at runtime so it never enters the bundle/worker config.

export type ParsedStatementLine = {
  txn_date: string;
  description: string;
  amount: number;
  direction: "in" | "out";
};

type Item = { str: string; x: number; y: number; page: number };

const PDFJS_VERSION = "4.10.38";
const AMOUNT = /^-?[\d,]*\.\d{2,3}$/;
const DATE = /^\d{2}-\d{2}-\d{4}$/;
const isoDate = (d: string) => { const [dd, mm, yy] = d.split("-"); return `${yy}-${mm}-${dd}`; };
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPdfjs(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__zwPdfjs) return w.__zwPdfjs;
  const base = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/`;
  const url = base + "pdf.min.mjs";
  const pdfjs = await import(/* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */ url);
  pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
  w.__zwPdfjs = pdfjs;
  return pdfjs;
}

/** Core column-aware parser (pure, unit-testable). */
export function parseEtihadItems(items: Item[]): ParsedStatementLine[] {
  const rows: { page: number; y: number; items: Item[] }[] = [];
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  let cur: { page: number; y: number; items: Item[] } | null = null;
  for (const it of sorted) {
    if (!cur || it.page !== cur.page || Math.abs(it.y - cur.y) > 3) { cur = { page: it.page, y: it.y, items: [] }; rows.push(cur); }
    cur.items.push(it);
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);

  const header = rows.find((r) => {
    const t = r.items.map((i) => i.str).join(" ");
    return t.includes("Balance") && t.includes("Credit") && t.includes("Debit") && t.includes("Description");
  });
  if (!header) return [];
  const xOf = (label: string) => { const it = header.items.find((i) => i.str.trim() === label); return it ? it.x : null; };
  const col = {
    balance: xOf("Balance") ?? 20,
    credit: xOf("Credit") ?? 114,
    debit: xOf("Debit") ?? 209,
    valueDate: xOf("Value Date") ?? 304,
    desc: xOf("Description") ?? 399,
    date: xOf("Date") ?? 493,
  };

  const nearestAmountCol = (x: number) => {
    const cands: [string, number][] = [["balance", col.balance], ["credit", col.credit], ["debit", col.debit]];
    return cands.reduce((best, c) => (Math.abs(x - c[1]) < Math.abs(x - best[1]) ? c : best))[0];
  };
  const descLo = (col.valueDate + col.desc) / 2;
  const descHi = (col.desc + col.date) / 2;

  const summary = rows.find((r) => r.y < header.y && /Number of|Transactions/.test(r.items.map((i) => i.str).join(" ")));
  const floorY = summary ? summary.y : -Infinity;

  const anchors: { y: number; date: string; debit: number; credit: number }[] = [];
  for (const r of rows) {
    if (r.y >= header.y || r.y <= floorY) continue;
    const dateTok = r.items.find((i) => DATE.test(i.str.trim()) && i.x > descHi);
    if (!dateTok) continue;
    let debit = 0, credit = 0;
    for (const i of r.items) {
      const s = i.str.trim().replace(/,/g, "");
      if (!AMOUNT.test(s)) continue;
      const c = nearestAmountCol(i.x);
      if (c === "debit") debit = Number(s);
      else if (c === "credit") credit = Number(s);
    }
    if (debit === 0 && credit === 0) continue;
    anchors.push({ y: r.y, date: isoDate(dateTok.str.trim()), debit, credit });
  }
  if (anchors.length === 0) return [];
  anchors.sort((a, b) => b.y - a.y);

  const descToks: Item[] = [];
  for (const r of rows) {
    if (r.y >= header.y || r.y <= floorY) continue;
    for (const i of r.items) {
      const s = i.str.trim();
      if (i.x < descLo || i.x > descHi) continue;
      if (AMOUNT.test(s.replace(/,/g, "")) || DATE.test(s)) continue;
      if (/BROUGHT FORWARD|^BALANCE$/i.test(s)) continue;
      if (!/[A-Za-z0-9]/.test(s)) continue;
      descToks.push(i);
    }
  }

  const buckets: Item[][] = anchors.map(() => []);
  for (const tk of descToks) {
    let bi = 0, bd = Infinity;
    anchors.forEach((a, idx) => { const d = Math.abs(a.y - tk.y); if (d < bd) { bd = d; bi = idx; } });
    buckets[bi].push(tk);
  }

  return anchors.map((a, idx) => ({
    txn_date: a.date,
    description: clean(buckets[idx].sort((p, q) => q.y - p.y || p.x - q.x).map((t) => t.str).join(" ")) || "—",
    amount: a.debit > 0 ? a.debit : a.credit,
    direction: (a.debit > 0 ? "out" : "in") as "in" | "out",
  }));
}

/** Load a PDF File and extract reconciliation lines. */
export async function parseEtihadStatement(file: File): Promise<ParsedStatementLine[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const items: Item[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of tc.items as any[]) {
      if (!it.transform) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: p });
    }
  }
  return parseEtihadItems(items);
}
