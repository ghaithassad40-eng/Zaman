import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";

const ROOT = "C:/Users/ghaith.assad/Documents/MVP/Zamman Software/zaman-watch/scripts";
const EX = `${ROOT}/_xlsx`;
const OUT = `${ROOT}/photos`;
const XLSX_PATH = "C:/Users/ghaith.assad/Downloads/Zaman Store.xlsx";

// ---- 1. Reproduce the (sheet,row)->productSku mapping (same rules as import) ----
const SHEETS = {
  "الطلبية الاولى": { sku: 0, name: 1 },
  "الطلبية الثانية": { sku: 0, name: 1 },
  "الطلبية الثالثة": { sku: 0, name: 1 },
};
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
const skuNames = new Map();
function assignSku(rawSku, name) {
  if (!skuNames.has(rawSku)) skuNames.set(rawSku, new Map());
  const m = skuNames.get(rawSku);
  if (!m.has(name)) m.set(name, m.size === 0 ? rawSku : `${rawSku}-${m.size + 1}`);
  return m.get(name);
}

const wb = XLSX.read(readFileSync(XLSX_PATH), { cellDates: true });
const sheetNames = wb.SheetNames;
// rowProductSku[sheetIndex (1-based)] = Map(originalRowIndex -> productSku)
const rowMap = {};
let synthetic = 0;
sheetNames.forEach((name, sIdx0) => {
  const map = SHEETS[name];
  if (!map) return;
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });
  const rmap = new Map();
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    let rawSku = String(row[map.sku] ?? "").trim();
    let nm = norm(row[map.name]);
    if (!nm) continue;
    if (nm === "-") nm = "صنف غير مسمى";
    if (!rawSku) rawSku = `IMPORT-${sIdx0 + 1}-${++synthetic}`;
    rmap.set(r, assignSku(rawSku, nm));
  }
  rowMap[sIdx0 + 1] = rmap;
});

// ---- 2. Map sheet -> drawing file via worksheet rels ----
function readMaybe(p) {
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}
function sheetDrawing(sheetIdx) {
  const rels = readMaybe(`${EX}/xl/worksheets/_rels/sheet${sheetIdx}.xml.rels`);
  const m = rels.match(/Target="[^"]*drawing(\d+)\.xml"/);
  return m ? Number(m[1]) : null;
}

// ---- 3. Parse a drawing: list of {row, media} ----
function parseDrawing(drawingNo) {
  const xml = readMaybe(`${EX}/xl/drawings/drawing${drawingNo}.xml`);
  const rels = readMaybe(`${EX}/xl/drawings/_rels/drawing${drawingNo}.xml.rels`);
  const embedToFile = {};
  for (const m of rels.matchAll(/Id="([^"]+)"\s+[^>]*Target="([^"]+)"/g)) {
    embedToFile[m[1]] = m[2].replace(/^\.\.\//, "");
  }
  const anchors = xml.split(/<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/);
  const out = [];
  for (const a of anchors) {
    const from = a.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/);
    const embed = a.match(/r:embed="([^"]+)"/);
    if (!from || !embed) continue;
    const rowM = from[1].match(/<xdr:row>(\d+)<\/xdr:row>/);
    if (!rowM) continue;
    const file = embedToFile[embed[1]];
    if (!file) continue;
    out.push({ row: Number(rowM[1]), media: file });
  }
  return out;
}

// ---- 4. Build manifest ----
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const manifest = [];
let matched = 0, unmatched = 0;
const seenSku = new Set();
for (let s = 1; s <= 3; s++) {
  const dno = sheetDrawing(s);
  if (!dno) continue;
  const imgs = parseDrawing(dno);
  for (const img of imgs) {
    const sku = rowMap[s]?.get(img.row);
    if (!sku) { unmatched++; continue; }
    if (seenSku.has(sku)) continue; // first image per product
    seenSku.add(sku);
    const ext = img.media.split(".").pop();
    const safe = sku.replace(/[^\w.\-]/g, "_");
    const fname = `${safe}.${ext}`;
    copyFileSync(`${EX}/xl/${img.media}`, `${OUT}/${fname}`);
    manifest.push({ sku, file: fname });
    matched++;
  }
}

writeFileSync(`${ROOT}/photo-manifest.json`, JSON.stringify(manifest, null, 2), "utf8");
console.log(`Mapped images: ${matched}  | unmatched anchors: ${unmatched}  | products with photo: ${manifest.length}`);
console.log(`Photos -> scripts/photos/  | manifest -> scripts/photo-manifest.json`);
