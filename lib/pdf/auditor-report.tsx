import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import type { Tables } from "@/types/database.types";

let fontsRegistered = false;
let fontsRegisterFailed = false;
function registerFonts() {
  if (fontsRegistered || fontsRegisterFailed) return;
  try {
    Font.register({
      family: "Amiri",
      fonts: [
        { src: "https://fonts.gstatic.com/s/amiri/v27/J7aRnpd8CGxBHpUgtUuU.ttf" },
        { src: "https://fonts.gstatic.com/s/amiri/v27/J7afnpd8CGxBHpSp_Iqr.ttf", fontWeight: 700 },
      ],
    });
    fontsRegistered = true;
  } catch { fontsRegisterFailed = true; }
}

export type FinSnapshot = {
  pl: { revenue: number; cogs: number; gross_profit: number; delivery_income: number; delivery_expense: number; marketing: number; expenses: number; net_profit: number };
  balance_sheet: {
    cash: number; courier_receivable: number; vendor_payable?: number; inventory: number; equipment: number; packaging_inventory: number; total_assets: number;
    gst_payable: number; total_liabilities: number; contributed_capital: number; opening_capital: number; retained_earnings: number; drawings: number; total_equity: number;
  };
  partners: { id: string; name: string; name_ar: string | null; pct: number; capital: number; profit_share: number; drawings: number; equity: number }[];
};

export type AuditorReportArgs = {
  company: Tables<"company_settings"> | null;
  current: FinSnapshot;
  prior: FinSnapshot | null;
  period: { from: string; to: string; label: string; priorLabel: string | null; closingMethodEn: string; closingMethodAr: string };
  generatedOn: string;
};

const s = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: "#1c1810", lineHeight: 1.5 },
  center: { textAlign: "center" },
  brand: { fontSize: 22, fontWeight: 700, color: "#9a7426", textAlign: "center" },
  brandAr: { fontSize: 14, color: "#9a7426", textAlign: "center", marginTop: 2 },
  coverWrap: { marginTop: 150, alignItems: "center" },
  coverTitle: { fontSize: 18, fontWeight: 700, marginTop: 40, textAlign: "center" },
  coverTitleAr: { fontSize: 14, fontWeight: 700, textAlign: "center" },
  coverSub: { fontSize: 11, color: "#4a3a18", marginTop: 14, textAlign: "center" },
  coverLine: { fontSize: 10, color: "#7a6e57", marginTop: 4, textAlign: "center" },
  h1: { fontSize: 13, fontWeight: 700, color: "#9a7426", marginBottom: 2 },
  h1Ar: { fontSize: 11, fontWeight: 700, color: "#9a7426", marginBottom: 8, textAlign: "right" },
  h2: { fontSize: 10.5, fontWeight: 700, marginTop: 10, marginBottom: 3 },
  p: { marginBottom: 6, textAlign: "justify" },
  muted: { color: "#7a6e57" },
  small: { fontSize: 8.5 },
  divider: { borderBottomWidth: 1, borderColor: "#e7e0d1", marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.2 },
  rowBorder: { borderTopWidth: 1, borderColor: "#e7e0d1", marginTop: 3, paddingTop: 4 },
  cLabel: { flex: 5 },
  cNum: { flex: 2, textAlign: "right" },
  cNumHead: { flex: 2, textAlign: "right", fontWeight: 700, fontSize: 8.5, color: "#7a6e57" },
  indent: { paddingLeft: 12 },
  strong: { fontWeight: 700 },
  accent: { color: "#9a7426", fontWeight: 700 },
  sectionHead: { fontWeight: 700, marginTop: 8, marginBottom: 2 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#9a8e74", borderTopWidth: 1, borderColor: "#eee5d4", paddingTop: 5 },
  pageHead: { position: "absolute", top: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#9a8e74" },
  sigBox: { marginTop: 30, width: "55%" },
  sigLine: { borderTopWidth: 1, borderColor: "#1c1810", marginTop: 26, paddingTop: 3 },
});

const m = (n: number) => {
  const v = Number(n ?? 0);
  const a = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return v < 0 ? `(${a})` : a;
};
const par = (n: number) => `(${Math.abs(Number(n ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })})`;

function Foot({ company, label }: { company: Tables<"company_settings"> | null; label: string }) {
  return (
    <>
      <View style={s.pageHead} fixed>
        <Text>{company?.name || "Zaman Watch"}</Text>
        <Text>{label}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text>Financial Statements · القوائم المالية</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </>
  );
}

function FigHead() {
  return (
    <View style={[s.row, { borderBottomWidth: 1, borderColor: "#e7e0d1", paddingBottom: 3 }]}>
      <Text style={s.cLabel}> </Text>
      <Text style={s.cNumHead}>Current</Text>
      <Text style={s.cNumHead}>Prior</Text>
    </View>
  );
}

function Fig({ label, cur, prior, strong, accent, indent, parens, head }: { label: string; cur?: number; prior?: number | null; strong?: boolean; accent?: boolean; indent?: boolean; parens?: boolean; head?: boolean }) {
  if (head) return <Text style={s.sectionHead}>{label}</Text>;
  const fmt = (n?: number | null) => (n == null ? "—" : parens ? par(n) : m(n));
  return (
    <View style={[s.row, accent ? s.rowBorder : {}]}>
      <Text style={[s.cLabel, indent ? s.indent : {}, strong ? s.strong : {}, accent ? s.accent : {}]}>{label}</Text>
      <Text style={[s.cNum, strong ? s.strong : {}, accent ? s.accent : {}]}>{fmt(cur)}</Text>
      <Text style={[s.cNum, s.muted]}>{fmt(prior)}</Text>
    </View>
  );
}

export function AuditorReportDocument({ company, current, prior, period, generatedOn }: AuditorReportArgs) {
  const name = company?.name || "Zaman Watch Co.";
  const nameAr = company?.name_ar || "شركة زمن للساعات";
  const b = current.balance_sheet;
  const pb = prior?.balance_sheet ?? null;
  const pl = current.pl;
  const ppl = prior?.pl ?? null;
  const capital = b.contributed_capital + b.opening_capital;
  const pCapital = pb ? pb.contributed_capital + pb.opening_capital : null;

  // Changes in equity (period deltas).
  const beginEquity = pb ? pb.total_equity : 0;
  const dCapital = pb ? capital - (pb.contributed_capital + pb.opening_capital) : capital;
  const dDrawings = pb ? b.drawings - pb.drawings : b.drawings;

  // Cash flow (indirect, simplified & balanced).
  const beginCash = pb ? pb.cash : 0;
  const dCash = b.cash - beginCash;
  const netFinancing = dCapital - dDrawings;
  const netOperating = dCash - netFinancing;
  const wcChange = netOperating - pl.net_profit;

  const auditorFirm = company?.auditor_firm || "[Audit Firm]";
  const auditorName = company?.auditor_name || "[Licensed Auditor]";
  const auditorLic = company?.auditor_license || "____";
  const pageStyle = fontsRegistered ? [s.page, { fontFamily: "Amiri" }] : s.page;

  return (
    <Document>
      {/* COVER */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.brand}>{name.toUpperCase()}</Text>
        <Text style={s.brandAr}>{nameAr}</Text>
        <View style={s.coverWrap}>
          <Text style={s.coverTitle}>FINANCIAL STATEMENTS</Text>
          <Text style={s.coverTitleAr}>القوائم المالية</Text>
          <Text style={s.coverSub}>For the {period.closingMethodEn.toLowerCase()} period ended {period.to}</Text>
          <Text style={[s.coverLine]}>للفترة {period.closingMethodAr} المنتهية في {period.to}</Text>
          <Text style={[s.coverSub, { marginTop: 26 }]}>Together with the</Text>
          <Text style={s.coverTitle}>INDEPENDENT AUDITOR&apos;S REPORT</Text>
          <Text style={s.coverTitleAr}>تقرير المدقق المستقل</Text>
          {company?.tax_number ? <Text style={[s.coverLine, { marginTop: 26 }]}>Tax No. / الرقم الضريبي: {company.tax_number}</Text> : null}
          {company?.commercial_reg ? <Text style={s.coverLine}>Commercial Reg. / السجل التجاري: {company.commercial_reg}</Text> : null}
          {company?.national_no ? <Text style={s.coverLine}>National No. / الرقم الوطني: {company.national_no}</Text> : null}
          <Text style={[s.coverLine, { marginTop: 20 }]}>Amman — Hashemite Kingdom of Jordan</Text>
        </View>
        <Foot company={company} label={period.label} />
      </Page>

      {/* AUDITOR'S REPORT */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.h1}>INDEPENDENT AUDITOR&apos;S REPORT</Text>
        <Text style={s.h1Ar}>تقرير المدقق المستقل</Text>
        <Text style={s.strong}>To the Partners of {name}</Text>

        <Text style={s.h2}>Opinion</Text>
        <Text style={s.p}>
          We have audited the financial statements of {name} (the &quot;Company&quot;), which comprise the statement of financial
          position as at {period.to}, and the statement of profit or loss, statement of changes in partners&apos; equity and statement
          of cash flows for the {period.closingMethodEn.toLowerCase()} period then ended, and notes to the financial statements,
          including a summary of significant accounting policies.
        </Text>
        <Text style={s.p}>
          In our opinion, the accompanying financial statements present fairly, in all material respects, the financial position of
          the Company as at {period.to}, and its financial performance and its cash flows for the period then ended in accordance
          with International Financial Reporting Standards (IFRS).
        </Text>

        <Text style={s.h2}>Basis for Opinion</Text>
        <Text style={s.p}>
          We conducted our audit in accordance with International Standards on Auditing (ISAs). Our responsibilities under those
          standards are further described in the Auditor&apos;s Responsibilities section of our report. We are independent of the
          Company in accordance with the International Code of Ethics for Professional Accountants (including International
          Independence Standards) issued by IESBA, together with the ethical requirements applicable in the Hashemite Kingdom of
          Jordan, and we have fulfilled our other ethical responsibilities in accordance with these requirements. We believe that the
          audit evidence we have obtained is sufficient and appropriate to provide a basis for our opinion.
        </Text>

        <Text style={s.h2}>Responsibilities of Management and Those Charged with Governance</Text>
        <Text style={s.p}>
          Management is responsible for the preparation and fair presentation of these financial statements in accordance with IFRS,
          and for such internal control as management determines is necessary to enable the preparation of financial statements that
          are free from material misstatement, whether due to fraud or error. In preparing the financial statements, management is
          responsible for assessing the Company&apos;s ability to continue as a going concern and using the going concern basis of
          accounting unless management intends to liquidate the Company or to cease operations, or has no realistic alternative but to
          do so.
        </Text>

        <Text style={s.h2}>Auditor&apos;s Responsibilities for the Audit of the Financial Statements</Text>
        <Text style={s.p}>
          Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material
          misstatement, whether due to fraud or error, and to issue an auditor&apos;s report that includes our opinion. Reasonable
          assurance is a high level of assurance, but is not a guarantee that an audit conducted in accordance with ISAs will always
          detect a material misstatement when it exists. Misstatements can arise from fraud or error and are considered material if,
          individually or in the aggregate, they could reasonably be expected to influence the economic decisions of users taken on
          the basis of these financial statements.
        </Text>

        <Text style={s.h2}>Report on Other Legal and Regulatory Requirements</Text>
        <Text style={s.p}>
          The Company maintains proper accounting records that are in agreement with the accompanying financial statements, and we
          recommend that the General Assembly of Partners approve these financial statements, in accordance with the Jordanian
          Companies Law in effect.
        </Text>

        <View style={s.sigBox}>
          <Text style={s.strong}>{auditorFirm}</Text>
          {company?.auditor_name_ar ? <Text style={s.small}>{company.auditor_name_ar}</Text> : null}
          <View style={s.sigLine}>
            <Text>{auditorName}</Text>
            <Text style={s.small}>Licensed Auditor — JACPA License No. {auditorLic}</Text>
            <Text style={s.small}>Amman — Jordan, {generatedOn}</Text>
          </View>
        </View>
        <Foot company={company} label="Auditor's Report" />
      </Page>

      {/* STATEMENT OF FINANCIAL POSITION */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.h1}>STATEMENT OF FINANCIAL POSITION</Text>
        <Text style={s.h1Ar}>قائمة المركز المالي</Text>
        <Text style={[s.small, s.muted, { marginBottom: 6 }]}>As at {period.to} — All amounts in Jordanian Dinars (JOD)</Text>
        <FigHead />
        <Fig label="ASSETS" head />
        <Fig label="Non-current assets" strong />
        <Fig label="Property and equipment" cur={b.equipment} prior={pb?.equipment} indent />
        <Fig label="Current assets" strong />
        <Fig label="Inventory" cur={b.inventory} prior={pb?.inventory} indent />
        <Fig label="Packaging supplies" cur={b.packaging_inventory} prior={pb?.packaging_inventory} indent />
        <Fig label="Trade and other receivables" cur={b.courier_receivable} prior={pb?.courier_receivable} indent />
        <Fig label="Cash and cash equivalents" cur={b.cash} prior={pb?.cash} indent />
        <Fig label="Total assets" cur={b.total_assets} prior={pb?.total_assets} strong accent />

        <View style={{ height: 8 }} />
        <Fig label="EQUITY AND LIABILITIES" head />
        <Fig label="Partners' equity" strong />
        <Fig label="Partners' capital" cur={capital} prior={pCapital} indent />
        <Fig label="Retained earnings" cur={b.retained_earnings} prior={pb?.retained_earnings} indent />
        <Fig label="Partners' drawings" cur={b.drawings} prior={pb?.drawings} indent parens />
        <Fig label="Total equity" cur={b.total_equity} prior={pb?.total_equity} strong accent />
        <Fig label="Liabilities" strong />
        <Fig label="Sales tax (GST) payable" cur={b.gst_payable} prior={pb?.gst_payable} indent />
        <Fig label="Trade and other payables" cur={b.vendor_payable ?? 0} prior={pb?.vendor_payable ?? 0} indent />
        <Fig label="Total liabilities" cur={b.total_liabilities} prior={pb?.total_liabilities} strong />
        <Fig label="Total equity and liabilities" cur={b.total_equity + b.total_liabilities} prior={pb ? pb.total_equity + pb.total_liabilities : null} strong accent />
        <Text style={[s.small, s.muted, { marginTop: 10 }]}>The accompanying notes form an integral part of these financial statements.</Text>
        <Foot company={company} label="Financial Position" />
      </Page>

      {/* STATEMENT OF PROFIT OR LOSS */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.h1}>STATEMENT OF PROFIT OR LOSS</Text>
        <Text style={s.h1Ar}>قائمة الأرباح أو الخسائر</Text>
        <Text style={[s.small, s.muted, { marginBottom: 6 }]}>For the {period.closingMethodEn.toLowerCase()} period ended {period.to} — in JOD</Text>
        <FigHead />
        <Fig label="Revenue (net of GST)" cur={pl.revenue} prior={ppl?.revenue} />
        <Fig label="Cost of sales" cur={pl.cogs} prior={ppl?.cogs} parens />
        <Fig label="Gross profit" cur={pl.gross_profit} prior={ppl?.gross_profit} strong accent />
        <Fig label="Delivery income" cur={pl.delivery_income} prior={ppl?.delivery_income} />
        <Fig label="Delivery expenses" cur={pl.delivery_expense} prior={ppl?.delivery_expense} parens />
        <Fig label="Selling and marketing expenses" cur={pl.marketing} prior={ppl?.marketing} parens />
        <Fig label="General and administrative expenses" cur={pl.expenses} prior={ppl?.expenses} parens />
        <Fig label="Profit for the period" cur={pl.net_profit} prior={ppl?.net_profit} strong accent />
        <Text style={[s.small, s.muted, { marginTop: 10 }]}>The accompanying notes form an integral part of these financial statements.</Text>
        <Foot company={company} label="Profit or Loss" />
      </Page>

      {/* STATEMENT OF CHANGES IN EQUITY */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.h1}>STATEMENT OF CHANGES IN PARTNERS&apos; EQUITY</Text>
        <Text style={s.h1Ar}>قائمة التغيّرات في حقوق الشركاء</Text>
        <Text style={[s.small, s.muted, { marginBottom: 6 }]}>For the {period.closingMethodEn.toLowerCase()} period ended {period.to} — in JOD</Text>
        <Fig label="Balance at beginning of period" cur={beginEquity} prior={null} strong />
        <Fig label="Capital introduced" cur={dCapital} prior={null} indent />
        <Fig label="Profit for the period" cur={pl.net_profit} prior={null} indent />
        <Fig label="Partners' drawings" cur={dDrawings} prior={null} indent parens />
        <Fig label="Balance at end of period" cur={b.total_equity} prior={null} strong accent />

        <Text style={[s.h2, { marginTop: 18 }]}>Partners&apos; equity by partner (closing)</Text>
        <View style={[s.row, { borderBottomWidth: 1, borderColor: "#e7e0d1", paddingBottom: 3 }]}>
          <Text style={[s.cLabel, s.strong]}>Partner</Text>
          <Text style={s.cNumHead}>Share %</Text>
          <Text style={s.cNumHead}>Equity</Text>
        </View>
        {current.partners.map((p) => (
          <View style={s.row} key={p.id}>
            <Text style={s.cLabel}>{p.name}</Text>
            <Text style={s.cNum}>{p.pct}%</Text>
            <Text style={s.cNum}>{m(p.equity)}</Text>
          </View>
        ))}
        <Foot company={company} label="Changes in Equity" />
      </Page>

      {/* STATEMENT OF CASH FLOWS */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.h1}>STATEMENT OF CASH FLOWS</Text>
        <Text style={s.h1Ar}>قائمة التدفقات النقدية</Text>
        <Text style={[s.small, s.muted, { marginBottom: 6 }]}>For the {period.closingMethodEn.toLowerCase()} period ended {period.to} — in JOD (indirect method)</Text>
        <Fig label="Cash flows from operating activities" head />
        <Fig label="Profit for the period" cur={pl.net_profit} prior={null} indent />
        <Fig label="Changes in working capital (net)" cur={wcChange} prior={null} indent />
        <Fig label="Net cash from operating activities" cur={netOperating} prior={null} strong />
        <View style={{ height: 6 }} />
        <Fig label="Cash flows from financing activities" head />
        <Fig label="Capital introduced by partners" cur={dCapital} prior={null} indent />
        <Fig label="Drawings by partners" cur={dDrawings} prior={null} indent parens />
        <Fig label="Net cash from financing activities" cur={netFinancing} prior={null} strong />
        <View style={{ height: 6 }} />
        <Fig label="Net increase in cash and cash equivalents" cur={dCash} prior={null} strong />
        <Fig label="Cash and cash equivalents at beginning of period" cur={beginCash} prior={null} />
        <Fig label="Cash and cash equivalents at end of period" cur={b.cash} prior={null} strong accent />
        <Foot company={company} label="Cash Flows" />
      </Page>

      {/* NOTES */}
      <Page size="A4" style={pageStyle}>
        <Text style={s.h1}>NOTES TO THE FINANCIAL STATEMENTS</Text>
        <Text style={s.h1Ar}>إيضاحات حول القوائم المالية</Text>

        <Text style={s.h2}>1. General information</Text>
        <Text style={s.p}>
          {name} ({nameAr}) is a limited liability company registered in the Hashemite Kingdom of Jordan
          {company?.commercial_reg ? ` under commercial registration No. ${company.commercial_reg}` : ""}. The Company&apos;s
          principal activity is the import and retail of watches and related accessories. These financial statements cover the
          {" "}{period.closingMethodEn.toLowerCase()} reporting period ended {period.to}.
        </Text>

        <Text style={s.h2}>2. Basis of preparation</Text>
        <Text style={s.p}>
          The financial statements have been prepared in accordance with International Financial Reporting Standards (IFRS) under the
          historical cost convention, on a going-concern and accrual basis. The functional and presentation currency is the Jordanian
          Dinar (JOD), rounded to three decimal places (fils).
        </Text>

        <Text style={s.h2}>3. Significant accounting policies</Text>
        <Text style={s.p}>
          <Text style={s.strong}>Revenue</Text> is recognised when control of goods is transferred to the customer, net of discounts and
          General Sales Tax (GST). <Text style={s.strong}>Inventory</Text> is measured at the lower of cost and net realisable value;
          cost is determined on a weighted-average basis and includes purchase price and directly attributable landing costs (shipping,
          customs and clearance). <Text style={s.strong}>Property and equipment</Text> is stated at cost and consumed over its expected
          useful output. <Text style={s.strong}>Packaging supplies</Text> are carried at cost and expensed as consumed per order.
        </Text>

        <Text style={s.h2}>4. Taxation</Text>
        <Text style={s.p}>
          The Company is registered for General Sales Tax at the statutory rate of {Number(company?.gst_rate ?? 16)}%. GST collected on
          sales, net of recoverable input tax, is remitted to the Income and Sales Tax Department. The net GST payable at the reporting
          date amounted to JOD {m(b.gst_payable)}.
        </Text>

        <Text style={s.h2}>5. Cash and inventory</Text>
        <Text style={s.p}>
          Cash and cash equivalents at the reporting date amounted to JOD {m(b.cash)}, held in the Company&apos;s bank and cash accounts.
          Inventory on hand was valued at JOD {m(b.inventory)} and packaging supplies at JOD {m(b.packaging_inventory)}.
        </Text>

        <Text style={s.h2}>6. Partners&apos; equity and related parties</Text>
        <Text style={s.p}>
          Partners&apos; equity comprises contributed and opening capital, accumulated retained earnings, less partners&apos; drawings.
          Profits and drawings are allocated to partners in proportion to their ownership interests as follows:
          {" "}{current.partners.map((p) => `${p.name} ${p.pct}%`).join("; ")}.
        </Text>

        <Text style={[s.small, s.muted, { marginTop: 16 }]}>
          These financial statements were approved and authorised for issue by the partners on {generatedOn}.
        </Text>
        <Foot company={company} label="Notes" />
      </Page>
    </Document>
  );
}

export async function downloadAuditorReport(args: AuditorReportArgs) {
  registerFonts();
  let blob: Blob;
  try {
    blob = await pdf(<AuditorReportDocument {...args} />).toBlob();
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.toLowerCase().includes("font") || msg.toLowerCase().includes("fetch")) {
      fontsRegistered = false;
      fontsRegisterFailed = true;
      try { Font.clear(); } catch { /* ignore */ }
      blob = await pdf(<AuditorReportDocument {...args} />).toBlob();
    } else {
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financial-statements-${args.period.to}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
