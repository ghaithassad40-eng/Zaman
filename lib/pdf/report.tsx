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
  } catch {
    fontsRegisterFailed = true;
  }
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#221c10" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  brand: { fontSize: 20, fontWeight: 700, color: "#9a7426" },
  brandSub: { fontSize: 11, color: "#9a7426" },
  title: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  titleAr: { fontSize: 12, fontWeight: 700, textAlign: "right" },
  muted: { color: "#7a6e57" },
  period: { borderWidth: 1, borderColor: "#e7e0d1", borderRadius: 6, padding: 8, marginBottom: 14, flexDirection: "row", justifyContent: "space-between" },
  section: { marginBottom: 12, borderWidth: 1, borderColor: "#e7e0d1", borderRadius: 6, overflow: "hidden" },
  sectionHead: { backgroundColor: "#f3efe6", padding: 7, fontSize: 9, fontWeight: 700, color: "#4a3a18", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 9, paddingVertical: 3.5, borderTopWidth: 1, borderColor: "#f1ead9" },
  rowLabel: {},
  rowLabelIndent: { paddingLeft: 12 },
  strong: { fontWeight: 700 },
  accent: { color: "#9a7426", fontWeight: 700 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#7a6e57" },
  note: { marginTop: 6, fontSize: 8, color: "#7a6e57" },
});

export type ReportRow = { label: string; value: string; strong?: boolean; muted?: boolean; indent?: boolean; accent?: boolean };
export type ReportSection = { heading?: string; rows: ReportRow[] };

export type FinancialReportArgs = {
  titleEn: string;
  titleAr: string;
  periodLabel: string;
  company: Tables<"company_settings"> | null;
  sections: ReportSection[];
  note?: string;
  generatedOn: string;
};

export function FinancialReportDocument({ titleEn, titleAr, periodLabel, company, sections, note, generatedOn }: FinancialReportArgs) {
  const pageStyle = fontsRegistered ? [styles.page, { fontFamily: "Amiri" }] : styles.page;
  return (
    <Document>
      <Page size="A4" style={pageStyle}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{company?.name || "ZAMAN WATCH"}</Text>
            <Text style={styles.brandSub}>{company?.name_ar || "زمن للساعات"}</Text>
            {company?.tax_number ? (
              <Text style={[styles.muted, { marginTop: 4, fontSize: 9 }]}>
                Tax No. / الرقم الضريبي: {company.tax_number}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.title}>{titleEn}</Text>
            <Text style={styles.titleAr}>{titleAr}</Text>
          </View>
        </View>

        <View style={styles.period}>
          <Text style={styles.muted}>Period / الفترة</Text>
          <Text style={styles.strong}>{periodLabel}</Text>
        </View>

        {sections.map((s, si) => (
          <View style={styles.section} key={si} wrap={false}>
            {s.heading ? <Text style={styles.sectionHead}>{s.heading}</Text> : null}
            {s.rows.map((r, ri) => (
              <View style={styles.row} key={ri}>
                <Text style={[r.indent ? styles.rowLabelIndent : styles.rowLabel, r.muted ? styles.muted : {}, r.strong ? styles.strong : {}]}>
                  {r.label}
                </Text>
                <Text style={[r.accent ? styles.accent : r.strong ? styles.strong : {}, r.muted ? styles.muted : {}]}>
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {note ? <Text style={styles.note}>{note}</Text> : null}

        <Text style={styles.footer}>
          {company?.name || "Zaman Watch"} · Generated {generatedOn}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadFinancialReport(args: FinancialReportArgs & { filename: string }) {
  registerFonts();
  const { filename, ...rest } = args;
  let blob: Blob;
  try {
    blob = await pdf(<FinancialReportDocument {...rest} />).toBlob();
  } catch (err) {
    // Font CDN may have failed — retry once with the built-in default font.
    const msg = (err as Error).message ?? "";
    if (msg.toLowerCase().includes("font") || msg.toLowerCase().includes("fetch")) {
      fontsRegistered = false;
      fontsRegisterFailed = true;
      try { Font.clear(); } catch { /* ignore */ }
      blob = await pdf(<FinancialReportDocument {...rest} />).toBlob();
    } else {
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
