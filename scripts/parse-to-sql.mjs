import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const path = "C:/Users/ghaith.assad/Downloads/Zaman Store.xlsx";
const wb = XLSX.read(readFileSync(path), { cellDates: true });

// Per-sheet column maps (0-based). landed = cost incl. clearance where present.
const SHEETS = {
  "الطلبية الاولى": { sku: 0, name: 1, bought: 3, sold: 4, current: 5, cost: 7, landed: 7, sell: 9 },
  "الطلبية الثانية": { sku: 0, name: 1, bought: 3, sold: 4, current: 5, cost: 6, landed: 6, sell: 8 },
  "الطلبية الثالثة": { sku: 0, name: 1, bought: 3, sold: 4, current: 5, cost: 7, landed: 8, sell: 10 },
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const esc = (s) => "'" + String(s ?? "").replace(/'/g, "''") + "'";
const escN = (s) => (s == null || s === "" ? "null" : esc(s));

function category(name) {
  if (/شدة|شده/.test(name)) return "accessory";
  if (/بوكس|علبة|كرت|باكج|غلاف|كيس|هدية/.test(name)) return "packaging";
  return "watch";
}

// Global product registry keyed by a UNIQUE product SKU.
// Merge rule: rows merge only when BOTH the Shein SKU and the product name
// match. Shein recycles SKUs across batches (e.g. st2411254181243272 is a
// strap in orders 1-2 but a smartwatch in order 3), so when the same SKU
// appears with a different name we keep it as a separate product and suffix
// the stored SKU (-2, -3) to satisfy the unique constraint.
const products = new Map(); // productSku -> {...}
const purchases = []; // {id, label, items: Map productSku->{qty, cost, landed, name, rawSku}}

let synthetic = 0;
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

const skuNames = new Map(); // rawSku -> Map(name -> assignedSku)
function assignSku(rawSku, name) {
  if (!skuNames.has(rawSku)) skuNames.set(rawSku, new Map());
  const m = skuNames.get(rawSku);
  if (!m.has(name)) m.set(name, m.size === 0 ? rawSku : `${rawSku}-${m.size + 1}`);
  return m.get(name);
}

wb.SheetNames.forEach((sheetName, sIdx) => {
  const map = SHEETS[sheetName];
  if (!map) return;
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const rows = aoa.slice(1).filter((r) => String(r[map.name] ?? "").trim() !== "");

  const purchase = { id: randomUUID(), label: sheetName, items: new Map() };

  for (const r of rows) {
    let rawSku = String(r[map.sku] ?? "").trim();
    let name = norm(r[map.name]);
    if (!name) continue; // truly empty name = spreadsheet summary row → skip
    if (name === "-") name = "صنف غير مسمى"; // keep unlabeled items with a placeholder
    if (!rawSku) rawSku = `IMPORT-${sIdx + 1}-${++synthetic}`;

    const psku = assignSku(rawSku, name); // unique product SKU

    const bought = num(r[map.bought]);
    const current = num(r[map.current]);
    const cost = round3(num(r[map.cost]));
    const landed = round3(num(r[map.landed]) || cost);
    const sell = round3(num(r[map.sell]));

    // Merge into global product (only same SKU + same name lands here)
    if (!products.has(psku)) {
      products.set(psku, {
        id: randomUUID(),
        sku: psku,
        rawSku,
        name,
        category: category(name),
        sell,
        boughtSum: 0,
        landedTimesBought: 0,
        currentSum: 0,
      });
    }
    const p = products.get(psku);
    p.sell = Math.max(p.sell, sell);
    p.boughtSum += bought;
    p.landedTimesBought += landed * bought;
    p.currentSum += current;

    // Merge into this batch's purchase_items
    if (!purchase.items.has(psku)) {
      purchase.items.set(psku, { psku, rawSku, name, qty: 0, costTimesQty: 0, landedTimesQty: 0 });
    }
    const it = purchase.items.get(psku);
    it.qty += bought;
    it.costTimesQty += cost * bought;
    it.landedTimesQty += landed * bought;
  }

  purchases.push(purchase);
});

// ---- Build SQL ----
const lines = [];
lines.push("-- Zaman Watch — import of legacy Google Sheet (Zaman Store.xlsx)");
lines.push("begin;");

// Products
lines.push("\ninsert into products (id, sku, name, name_ar, category, source, default_selling_price) values");
const prodVals = [...products.values()].map(
  (p) =>
    `(${esc(p.id)}, ${esc(p.sku)}, ${esc(p.name)}, ${esc(p.name)}, ${esc(p.category)}, 'shein', ${
      p.sell > 0 ? p.sell : "null"
    })`,
);
lines.push(prodVals.join(",\n") + ";");

// Inventory (current on-hand + weighted-avg landed cost)
lines.push("\ninsert into inventory (product_id, qty_on_hand, avg_unit_cost) values");
const invVals = [...products.values()].map((p) => {
  const avg = p.boughtSum > 0 ? round3(p.landedTimesBought / p.boughtSum) : 0;
  return `(${esc(p.id)}, ${p.currentSum}, ${avg})`;
});
lines.push(invVals.join(",\n") + ";");

// Opening stock movements (audit trail)
lines.push("\ninsert into inventory_movements (product_id, movement_type, qty, unit_cost, ref_table, note) values");
const movVals = [...products.values()]
  .filter((p) => p.currentSum !== 0)
  .map((p) => {
    const avg = p.boughtSum > 0 ? round3(p.landedTimesBought / p.boughtSum) : 0;
    return `(${esc(p.id)}, 'import_opening', ${p.currentSum}, ${avg}, 'import', 'Imported from Google Sheet')`;
  });
lines.push(movVals.join(",\n") + ";");

// Purchases + items
for (const pur of purchases) {
  const items = [...pur.items.values()];
  const itemsTotal = round3(items.reduce((s, it) => s + it.costTimesQty, 0));
  const landedTotal = round3(items.reduce((s, it) => s + it.landedTimesQty, 0));
  const clearance = round3(landedTotal - itemsTotal);

  lines.push(
    `\ninsert into purchases (id, reference, source, order_date, src_currency, fx_rate, items_total, clearance_cost, total_landed, status, notes) values ` +
      `(${esc(pur.id)}, ${esc(pur.label)}, 'shein', current_date, 'JOD', 1, ${itemsTotal}, ${clearance}, ${landedTotal}, 'received', 'Imported from Google Sheet');`,
  );

  lines.push("insert into purchase_items (purchase_id, product_id, sku, name, qty, unit_cost_src, unit_cost_jod, allocated_overhead, landed_unit_cost) values");
  const itemVals = items.map((it) => {
    const prod = products.get(it.psku);
    const unitCost = it.qty > 0 ? round3(it.costTimesQty / it.qty) : 0;
    const unitLanded = it.qty > 0 ? round3(it.landedTimesQty / it.qty) : 0;
    const overhead = round3((unitLanded - unitCost) * it.qty);
    return `(${esc(pur.id)}, ${esc(prod.id)}, ${esc(it.rawSku)}, ${esc(it.name)}, ${it.qty}, ${unitCost}, ${unitCost}, ${overhead}, ${unitLanded})`;
  });
  lines.push(itemVals.join(",\n") + ";");
}

lines.push("\ncommit;");

const sql = lines.join("\n");
writeFileSync("C:/Users/ghaith.assad/Documents/MVP/Zamman Software/zaman-watch/scripts/import.sql", sql, "utf8");

// Summary to stderr
const totalCurrent = [...products.values()].reduce((s, p) => s + p.currentSum, 0);
console.error(
  `Products: ${products.size}  | Purchases: ${purchases.length}  | Total on-hand: ${totalCurrent}  | Synthetic SKUs: ${synthetic}`,
);
console.error("Categories:", JSON.stringify(
  [...products.values()].reduce((a, p) => ((a[p.category] = (a[p.category] || 0) + 1), a), {}),
));
console.error("SQL written to scripts/import.sql (" + sql.length + " bytes)");
