import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const wb = XLSX.read(readFileSync("C:/Users/ghaith.assad/Downloads/Zaman Store.xlsx"), { cellDates: true });
const SHEETS = {
  "الطلبية الاولى":  { name:1, sold:4, cost:7, landed:7, sell:9,  sku:0 },
  "الطلبية الثانية": { name:1, sold:4, cost:6, landed:6, sell:8,  sku:0 },
  "الطلبية الثالثة": { name:1, sold:4, cost:7, landed:8, sell:10, sku:0 },
};
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const r3 = (n) => Math.round(n*1000)/1000;

let n=0, totalUnits=0;
for (const [sheet, m] of Object.entries(SHEETS)) {
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, blankrows:false, defval:"" });
  for (let i=1;i<aoa.length;i++){
    const row = aoa[i];
    const name = String(row[m.name] ?? "").trim();
    if (!name) continue;
    const sold = num(row[m.sold]);
    const sell = num(row[m.sell]);
    if (sold > 0 && sell <= 0) {
      n++; totalUnits += sold;
      const landed = r3(num(row[m.landed]) || num(row[m.cost]));
      console.log(`${n}. [${sheet}] ${name}  | SKU ${String(row[m.sku]).trim()} | sold ${sold} | cost ${landed.toFixed(3)}`);
    }
  }
}
console.log(`\n${n} products, ${totalUnits} units sold with no recorded price.`);
