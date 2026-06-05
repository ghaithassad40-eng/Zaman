import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const wb = XLSX.read(readFileSync("C:/Users/ghaith.assad/Downloads/Zaman Store.xlsx"), { cellDates: true });
const SHEETS = {
  "الطلبية الاولى":  { name:1, sold:4, sell:9,  sku:0 },
  "الطلبية الثانية": { name:1, sold:4, sell:8,  sku:0 },
  "الطلبية الثالثة": { name:1, sold:4, sell:10, sku:0 },
};
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const r3 = (n) => Math.round(n*1000)/1000;

const acc = new Map(); // sku -> {units, revenue}
for (const [sheet, m] of Object.entries(SHEETS)) {
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, blankrows:false, defval:"" });
  for (let i=1;i<aoa.length;i++){
    const row = aoa[i];
    const name = String(row[m.name] ?? "").trim();
    const sku = String(row[m.sku] ?? "").trim();
    if (!name || !sku) continue;
    const sold = num(row[m.sold]);
    const sell = num(row[m.sell]);
    if (sold <= 0) continue;
    const cur = acc.get(sku) || { units:0, revenue:0 };
    cur.units += sold;
    cur.revenue += sold * sell;
    acc.set(sku, cur);
  }
}

const rows = [...acc.entries()].map(([sku,v]) => `('${sku.replace(/'/g,"''")}', ${v.units}, ${r3(v.revenue)})`);
console.log(`update products as p set
  historical_units_sold = v.u,
  historical_revenue    = v.r
from (values\n  ${rows.join(",\n  ")}\n) as v(sku, u, r)
where p.sku = v.sku;`);
console.error(`-- ${rows.length} SKUs with sales, total units sold = ${[...acc.values()].reduce((s,v)=>s+v.units,0)}`);
