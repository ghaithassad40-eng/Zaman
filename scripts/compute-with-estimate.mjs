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

// Realized blended markup from priced sales
const PRICED_REV = 498.310, PRICED_COGS = 278.848;
const ratio = PRICED_REV / PRICED_COGS;   // ≈1.78691

let grossRev = PRICED_REV, cogs = PRICED_COGS;     // start from priced totals
const estimates = []; // {sku, name, price}
for (const [sheet, m] of Object.entries(SHEETS)) {
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, blankrows:false, defval:"" });
  for (let i=1;i<aoa.length;i++){
    const row = aoa[i];
    const name = String(row[m.name] ?? "").trim();
    if (!name) continue;
    const sold = num(row[m.sold]);
    const sell = num(row[m.sell]);
    if (sold > 0 && sell <= 0) {
      const landed = r3(num(row[m.landed]) || num(row[m.cost]));
      const unitPrice = r3(landed * ratio);
      grossRev += sold * unitPrice;
      cogs     += sold * landed;
      estimates.push({ sku:String(row[m.sku]).trim(), name, qty:sold, cost:landed, price:unitPrice });
    }
  }
}
grossRev = r3(grossRev); cogs = r3(cogs);

const gst = r3(grossRev * 16 / 116);
const subtotal = r3(grossRev - gst);
const grossProfit = r3(subtotal - cogs);

console.log("ratio = %s", ratio.toFixed(5));
console.log("--- UPDATED HISTORICAL TOTALS (incl. 15 estimated units, GST-inclusive) ---");
console.log("subtotal(ex GST) = %s", subtotal.toFixed(3));
console.log("gst_amount       = %s", gst.toFixed(3));
console.log("total(gross)     = %s", grossRev.toFixed(3));
console.log("total_cost(COGS) = %s", cogs.toFixed(3));
console.log("gross_profit     = %s", grossProfit.toFixed(3));
console.log("\n--- estimated unit prices (for product catalogue) ---");
for (const e of estimates) console.log(`${e.sku}\t${e.price.toFixed(3)}\t${e.name}`);
