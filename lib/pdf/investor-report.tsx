import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Tables } from "@/types/database.types";
import type { InvestorReport } from "@/lib/investor-report";
import { arabicFontActive, savePdf } from "@/lib/pdf/statement";

const GOLD = "#9a7426";
const INK = "#221c10";
const MUTED = "#7a6e57";
const BORDER = "#e7e0d1";
const SOFT = "#faf7f0";
const RED = "#b42318";

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 54, fontSize: 9, color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderColor: GOLD, paddingBottom: 10, marginBottom: 14 },
  brand: { fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: 1 },
  brandSub: { fontSize: 11, color: GOLD },
  title: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  titleAr: { fontSize: 11, textAlign: "right", color: MUTED },
  meta: { flexDirection: "row", gap: 18, marginBottom: 12 },
  metaItem: { flexDirection: "column" },
  metaLabel: { fontSize: 7.5, color: MUTED },
  metaValue: { fontSize: 10, fontWeight: 700 },
  about: { backgroundColor: SOFT, borderRadius: 6, padding: 10, marginBottom: 14, lineHeight: 1.45 },
  h2: { fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 6, marginTop: 6 },
  kpis: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, marginBottom: 8 },
  kpi: { width: "25%", padding: 3 },
  kpiInner: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 7 },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  kpiValue: { fontSize: 12, fontWeight: 700 },
  kpiSub: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  cols: { flexDirection: "row", gap: 14 },
  col: { flex: 1 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, marginBottom: 10 },
  thead: { flexDirection: "row", backgroundColor: "#f3efe6", borderBottomWidth: 1, borderColor: BORDER },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f1ead9", alignItems: "center" },
  th: { padding: 5, fontSize: 8, fontWeight: 700, color: "#4a3a18" },
  td: { padding: 5 },
  num: { textAlign: "right" },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 6 },
  lineStrong: { borderTopWidth: 1, borderColor: BORDER, marginTop: 2, paddingTop: 4, fontWeight: 700 },
  bar: { height: 7, backgroundColor: GOLD, borderRadius: 2 },
  note: { fontSize: 7.5, color: MUTED, marginTop: 2, marginBottom: 8, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
});

const makeMoney = (decimals: number) => (v: number) => {
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return v < 0 ? `(${s})` : s;
};
const monthLabel = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });

function Kpi({ label, value, sub, negative }: { label: string; value: string; sub?: string; negative?: boolean }) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiInner}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Text style={[styles.kpiValue, negative ? { color: RED } : {}]}>{value}</Text>
        {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Line({ label, value, strong, indent, fmt }: { label: string; value: number; strong?: boolean; indent?: boolean; fmt: (v: number) => string }) {
  return (
    <View style={[styles.line, strong ? styles.lineStrong : {}]}>
      <Text style={indent ? { color: MUTED, paddingLeft: 8 } : {}}>{label}</Text>
      <Text style={value < 0 ? { color: RED } : {}}>{fmt(value)}</Text>
    </View>
  );
}

export type InvestorReportArgs = {
  company: Tables<"company_settings"> | null;
  report: InvestorReport;
  preparedFor: string;
  about: string;
  includeOwnership: boolean;
  generatedOn: string;
  /** ISO code the amounts in `report` are expressed in (already converted). */
  currency: string;
  /** 1 JOD = `rate` × currency (1 when currency is JOD). */
  rate: number;
};

export function InvestorReportDocument({ company, report, preparedFor, about, includeOwnership, generatedOn, currency, rate }: InvestorReportArgs) {
  const name = company?.name || "Zaman Watch";
  const isJod = currency === "JOD";
  const money = makeMoney(isJod ? 3 : 2);
  const { kpis, pl, position: bs, stock, monthly, topProducts, owners } = report;
  const maxRev = Math.max(1, ...monthly.map((m) => m.revenue));
  const pageStyle = arabicFontActive() ? [styles.page, { fontFamily: "Amiri" }] : styles.page;
  let section = 0;
  const h = (en: string, ar: string) => `${++section}. ${en} · ${ar}`;

  return (
    <Document title={`${name} — Business profile`}>
      <Page size="A4" style={pageStyle}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{(company?.name || "ZAMAN WATCH").toUpperCase()}</Text>
            <Text style={styles.brandSub}>{company?.name_ar || "زمن للساعات"}</Text>
          </View>
          <View>
            <Text style={styles.title}>Business Profile & Financial Position</Text>
            <Text style={styles.titleAr}>الملف التعريفي والمركز المالي</Text>
          </View>
        </View>

        <View style={styles.meta}>
          {preparedFor ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Prepared for / مُعدّ لـ</Text>
              <Text style={styles.metaValue}>{preparedFor}</Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Period / الفترة</Text>
            <Text style={styles.metaValue}>{report.from} to {report.to}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Currency / العملة</Text>
            <Text style={styles.metaValue}>{currency}</Text>
          </View>
          {!isJod ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Exchange rate / سعر الصرف</Text>
              <Text style={styles.metaValue}>1 JOD = {rate} {currency}</Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Issued / تاريخ الإصدار</Text>
            <Text style={styles.metaValue}>{generatedOn}</Text>
          </View>
        </View>

        {about ? (
          <>
            <Text style={styles.h2}>{h("About us", "من نحن")}</Text>
            <View style={styles.about}><Text>{about}</Text></View>
          </>
        ) : null}

        <Text style={styles.h2}>{h("Key figures", "أهم المؤشرات")}</Text>
        <View style={styles.kpis}>
          <Kpi label="Revenue / الإيرادات" value={money(kpis.revenue)} />
          <Kpi label="Gross profit / مجمل الربح" value={money(kpis.grossProfit)} sub={`${kpis.grossMargin}% margin`} negative={kpis.grossProfit < 0} />
          <Kpi label="Net profit / صافي الربح" value={money(kpis.netProfit)} sub={`${kpis.netMargin}% margin`} negative={kpis.netProfit < 0} />
          <Kpi label="Orders / الطلبات" value={String(kpis.orders)} />
          <Kpi label="Avg. order / متوسط الطلب" value={money(kpis.avgOrder)} />
          <Kpi label="Units sold / الوحدات المباعة" value={String(kpis.unitsSold)} />
          <Kpi label="Customers / العملاء" value={String(kpis.customers)} />
          <Kpi label="Stock at retail / المخزون بسعر البيع" value={money(stock.atRetail)} sub={`${stock.units} units · ${stock.skus} SKUs`} />
        </View>

        {monthly.length > 0 && (
          <View wrap={false}>
            <Text style={styles.h2}>{h("Monthly performance", "الأداء الشهري")}</Text>
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { flex: 1.4 }]}>Month</Text>
                <Text style={[styles.th, styles.num, { flex: 1 }]}>Orders</Text>
                <Text style={[styles.th, styles.num, { flex: 1.6 }]}>Revenue</Text>
                <Text style={[styles.th, styles.num, { flex: 1.6 }]}>Gross profit</Text>
                <Text style={[styles.th, { flex: 3 }]} />
              </View>
              {monthly.map((m) => (
                <View style={styles.tr} key={m.month}>
                  <Text style={[styles.td, { flex: 1.4 }]}>{monthLabel(m.month)}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1 }]}>{m.orders}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1.6 }]}>{money(m.revenue)}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1.6 }]}>{money(m.grossProfit)}</Text>
                  <View style={[styles.td, { flex: 3 }]}>
                    <View style={[styles.bar, { width: `${Math.max(2, (m.revenue / maxRev) * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.cols} wrap={false}>
          <View style={styles.col}>
            <Text style={styles.h2}>{h("Income statement", "قائمة الدخل")}</Text>
            <View style={styles.table}>
              <Line label="Revenue (excl. GST)" value={pl.revenue} fmt={money} />
              <Line label="Cost of goods sold" value={-pl.cogs} indent fmt={money} />
              <Line label="Gross profit" value={pl.grossProfit} strong fmt={money} />
              {pl.deliveryIncome ? <Line label="Delivery income" value={pl.deliveryIncome} indent fmt={money} /> : null}
              {pl.deliveryExpense ? <Line label="Delivery cost" value={-pl.deliveryExpense} indent fmt={money} /> : null}
              <Line label="Marketing" value={-pl.marketing} indent fmt={money} />
              <Line label="Operating expenses" value={-pl.expenses} indent fmt={money} />
              {pl.depreciation ? <Line label="Depreciation" value={-pl.depreciation} indent fmt={money} /> : null}
              <Line label="Net profit" value={pl.netProfit} strong fmt={money} />
            </View>
          </View>
          <View style={styles.col}>
            <Text style={styles.h2}>{h("Financial position", "المركز المالي")}</Text>
            <View style={styles.table}>
              <Line label="Cash & bank" value={bs.cash} indent fmt={money} />
              {bs.courierReceivable ? <Line label="Due from courier" value={bs.courierReceivable} indent fmt={money} /> : null}
              <Line label="Inventory (at cost)" value={bs.inventory} indent fmt={money} />
              {bs.fixedAssets ? <Line label="Equipment (net)" value={bs.fixedAssets} indent fmt={money} /> : null}
              {Math.abs(bs.otherAssets) >= 0.001 ? <Line label="Other assets" value={bs.otherAssets} indent fmt={money} /> : null}
              <Line label="Total assets" value={bs.totalAssets} strong fmt={money} />
              <Line label="GST payable" value={bs.gstPayable} indent fmt={money} />
              {bs.vendorPayable ? <Line label="Due to suppliers" value={bs.vendorPayable} indent fmt={money} /> : null}
              <Line label="Total liabilities" value={bs.totalLiabilities} strong fmt={money} />
              <Line label="Owners' capital" value={bs.capital} indent fmt={money} />
              <Line label="Retained earnings" value={bs.retainedEarnings} indent fmt={money} />
              <Line label="Owner drawings" value={-bs.drawings} indent fmt={money} />
              <Line label="Total equity" value={bs.totalEquity} strong fmt={money} />
            </View>
          </View>
        </View>

        {topProducts.length > 0 && (
          <View wrap={false}>
            <Text style={styles.h2}>{h("Best sellers", "الأكثر مبيعاً")}</Text>
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { flex: 5 }]}>Product</Text>
                <Text style={[styles.th, styles.num, { flex: 1 }]}>Units</Text>
                <Text style={[styles.th, styles.num, { flex: 1.6 }]}>Revenue</Text>
                <Text style={[styles.th, styles.num, { flex: 1.2 }]}>Share</Text>
              </View>
              {topProducts.map((p, i) => (
                <View style={styles.tr} key={i}>
                  <Text style={[styles.td, { flex: 5 }]}>{p.name}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1 }]}>{p.units}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1.6 }]}>{money(p.revenue)}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1.2 }]}>
                    {kpis.revenue ? `${Math.round((p.revenue / kpis.revenue) * 100)}%` : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View wrap={false}>
          <Text style={styles.h2}>{h("Inventory on hand", "المخزون الحالي")}</Text>
          <View style={styles.kpis}>
            <Kpi label="Products in stock / أصناف" value={String(stock.skus)} />
            <Kpi label="Units / وحدات" value={String(stock.units)} />
            <Kpi label="Value at cost / بالتكلفة" value={money(stock.atCost)} />
            <Kpi label="Value at retail / بسعر البيع" value={money(stock.atRetail)} />
          </View>
        </View>

        {includeOwnership && owners.length > 0 && (
          <View wrap={false}>
            <Text style={styles.h2}>{h("Ownership", "هيكل الملكية")}</Text>
            <View style={styles.table}>
              {owners.map((o, i) => (
                <View style={styles.tr} key={i}>
                  <Text style={[styles.td, { flex: 4 }]}>{o.name}</Text>
                  <Text style={[styles.td, styles.num, { flex: 1 }]}>{o.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.note}>
          {isJod
            ? "Figures are in Jordanian Dinars (JOD)"
            : `Figures are in ${currency}, converted from the company's Jordanian Dinar (JOD) books at 1 JOD = ${rate} ${currency}`}
          , prepared from the company&apos;s management accounts for the period shown and unaudited.
          Revenue excludes 16% GST and cancelled or returned orders. Inventory is valued at weighted-average cost; “at retail” uses current list prices.
          Amounts in brackets are negative.
        </Text>

        <View style={styles.footer} fixed>
          <Text>{name} · Confidential — prepared for {preparedFor || "discussion purposes"}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadInvestorReportPdf(args: InvestorReportArgs) {
  const who = args.preparedFor ? `-${args.preparedFor.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : "";
  await savePdf(
    () => <InvestorReportDocument {...args} />,
    `business-profile${who}-${args.currency.toLowerCase()}-${args.report.from}-to-${args.report.to}.pdf`,
  );
}
