import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const wb = XLSX.read(readFileSync("C:/Users/ghaith.assad/Downloads/Zaman Store.xlsx"), { cellDates: true });

// col maps: sold qty, current qty, bought qty, cost/unit, landed/unit, selling/unit, sheet-profit
const SHEETS = {
  "الطلبية الاولى":  { name:1, bought:3, sold:4, cur:5, cost:7, landed:7, sell:9,  profit:12 },
  "الطلبية الثانية": { name:1, bought:3, sold:4, cur:5, cost:6, landed:6, sell:8,  profit:9  },
  "الطلبية الثالثة": { name:1, bought:3, sold:4, cur:5, cost:7, landed:8, sell:10, profit:12 },
};
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const r3 = (n) => Math.round(n*1000)/1000;

let unitsBought=0, unitsSold=0, unitsOnHand=0;
let grossRevenue=0, cogsSold=0, sheetProfitSum=0, invAtCost=0;
let soldButNoPrice=0;

for (const [sheet, m] of Object.entries(SHEETS)) {
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, blankrows:false, defval:"" });
  for (let i=1;i<aoa.length;i++){
    const row = aoa[i];
    const name = String(row[m.name] ?? "").trim();
    if (!name) continue;             // skip the spreadsheet's own totals rows
    const bought = num(row[m.bought]);
    const sold   = num(row[m.sold]);
    const cur    = num(row[m.cur]);
    const landed = r3(num(row[m.landed]) || num(row[m.cost]));
    const sell   = r3(num(row[m.sell]));
    unitsBought += bought; unitsSold += sold; unitsOnHand += cur;
    invAtCost   += cur * landed;
    sheetProfitSum += num(row[m.profit]);
    if (sold > 0) {
      if (sell > 0) { grossRevenue += sold*sell; cogsSold += sold*landed; }
      else soldButNoPrice += sold;
    }
  }
}

grossRevenue=r3(grossRevenue); cogsSold=r3(cogsSold); invAtCost=r3(invAtCost);
const grossProfit = r3(grossRevenue - cogsSold);

// GST 16% — two interpretations
const gstIncl = r3(grossRevenue*16/116);          // prices already include GST
const netRevIncl = r3(grossRevenue - gstIncl);
const netProfitIncl = r3(netRevIncl - cogsSold);
const gstExcl = r3(grossRevenue*0.16);            // GST added on top

console.log("UNITS    bought=%d  sold=%d  on-hand=%d", unitsBought, unitsSold, unitsOnHand);
console.log("SOLD w/o recorded price (excluded from revenue):", soldButNoPrice, "units");
console.log("");
console.log("REALIZED (completed sales):");
console.log("  Gross sales revenue (what customers paid) = %s JOD", grossRevenue.toFixed(3));
console.log("  COGS of sold units (landed cost)          = %s JOD", cogsSold.toFixed(3));
console.log("  Gross profit (revenue - cost)             = %s JOD", grossProfit.toFixed(3));
console.log("  [cross-check] sheet profit-column sum     = %s JOD", r3(sheetProfitSum).toFixed(3));
console.log("");
console.log("JORDAN GST 16%% — if selling prices INCLUDE tax (consumer retail, recommended):");
console.log("  Net revenue (ex-GST) = %s | Output GST owed = %s | Net profit after GST = %s",
  netRevIncl.toFixed(3), gstIncl.toFixed(3), netProfitIncl.toFixed(3));
console.log("JORDAN GST 16%% — if tax ADDED on top of recorded price:");
console.log("  Net revenue = %s | Output GST = %s | Gross profit unchanged = %s",
  grossRevenue.toFixed(3), gstExcl.toFixed(3), grossProfit.toFixed(3));
console.log("");
console.log("INVENTORY still on hand (unrealized, at landed cost) = %s JOD", invAtCost.toFixed(3));
console.log("TOTAL business value to date = realized profit %s + stock %s",
  grossProfit.toFixed(3), invAtCost.toFixed(3));
