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
function registerFonts() {
  if (fontsRegistered) return;
  try {
    Font.register({
      family: "Amiri",
      fonts: [
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.0.13/files/amiri-arabic-400-normal.ttf" },
        { src: "https://cdn.jsdelivr.net/npm/@fontsource/amiri@5.0.13/files/amiri-arabic-700-normal.ttf", fontWeight: 700 },
      ],
    });
    fontsRegistered = true;
  } catch {
    // fall back silently
  }
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#221c10", fontFamily: "Amiri" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  brand: { fontSize: 20, fontWeight: 700, color: "#9a7426" },
  brandSub: { fontSize: 11, color: "#9a7426" },
  title: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  muted: { color: "#7a6e57" },
  box: { borderWidth: 1, borderColor: "#e7e0d1", borderRadius: 6, padding: 10, marginBottom: 12 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  table: { borderWidth: 1, borderColor: "#e7e0d1", borderRadius: 6 },
  thead: { flexDirection: "row", backgroundColor: "#f3efe6", borderBottomWidth: 1, borderColor: "#e7e0d1" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f1ead9" },
  th: { padding: 5, fontSize: 8, fontWeight: 700, color: "#4a3a18" },
  td: { padding: 5 },
  cDate: { flex: 2 },
  cDesc: { flex: 4 },
  cNum: { flex: 2, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: "55%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#e7e0d1", marginTop: 4, paddingTop: 6, fontSize: 12, fontWeight: 700, color: "#9a7426" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#7a6e57" },
});

export type StatementLine = {
  txn_date: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

export type StatementParty = { name: string; name_ar?: string | null; phone?: string | null };

export type StatementArgs = {
  party: StatementParty;
  titleEn: string;
  titleAr: string;
  partyLabel: string; // "Vendor / المورّد" or "Customer / العميل"
  oweLabel: string; // shown when closing >= 0, e.g. "owes you"
  oweReverseLabel: string; // shown when closing < 0, e.g. "you owe"
  company: Tables<"company_settings"> | null;
  lines: StatementLine[];
  opening: number;
  totalDebit: number;
  totalCredit: number;
  closing: number;
  generatedOn: string;
  periodLabel?: string;
};

function money(n: number) {
  return Number(n ?? 0).toFixed(3);
}

export function StatementDocument({
  party,
  titleEn,
  titleAr,
  partyLabel,
  oweLabel,
  oweReverseLabel,
  company,
  lines,
  opening,
  totalDebit,
  totalCredit,
  closing,
  generatedOn,
  periodLabel,
}: StatementArgs) {
  const balLabel = closing >= 0 ? oweLabel : oweReverseLabel;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
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
            <Text style={[styles.title, { fontSize: 12 }]}>{titleAr}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <View style={styles.metaRow}>
            <Text style={styles.muted}>{partyLabel}</Text>
            <Text style={{ fontWeight: 700 }}>{party.name}{party.name_ar ? ` · ${party.name_ar}` : ""}</Text>
          </View>
          {party.phone ? (
            <View style={styles.metaRow}><Text style={styles.muted}>Phone</Text><Text>{party.phone}</Text></View>
          ) : null}
          {periodLabel ? (
            <View style={styles.metaRow}><Text style={styles.muted}>Period / الفترة</Text><Text>{periodLabel}</Text></View>
          ) : null}
          <View style={styles.metaRow}><Text style={styles.muted}>Generated</Text><Text>{generatedOn}</Text></View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cDesc]}>Description</Text>
            <Text style={[styles.th, styles.cNum]}>Debit</Text>
            <Text style={[styles.th, styles.cNum]}>Credit</Text>
            <Text style={[styles.th, styles.cNum]}>Balance</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.cDate]}>—</Text>
            <Text style={[styles.td, styles.cDesc, styles.muted]}>Opening balance</Text>
            <Text style={[styles.td, styles.cNum]}></Text>
            <Text style={[styles.td, styles.cNum]}></Text>
            <Text style={[styles.td, styles.cNum]}>{money(opening)}</Text>
          </View>
          {lines.map((l, i) => (
            <View style={styles.tr} key={i}>
              <Text style={[styles.td, styles.cDate]}>{l.txn_date}</Text>
              <Text style={[styles.td, styles.cDesc]}>{l.label}</Text>
              <Text style={[styles.td, styles.cNum]}>{l.debit ? money(l.debit) : ""}</Text>
              <Text style={[styles.td, styles.cNum]}>{l.credit ? money(l.credit) : ""}</Text>
              <Text style={[styles.td, styles.cNum]}>{money(l.balance)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Total debit / مدين</Text>
            <Text>{money(totalDebit)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Total credit / دائن</Text>
            <Text>{money(totalCredit)}</Text>
          </View>
          <View style={styles.grand}>
            <Text>Closing ({balLabel})</Text>
            <Text>{money(Math.abs(closing))} JOD</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {company?.name || "Zaman Watch"} · {titleEn} · {titleAr}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadStatementPdf(args: StatementArgs & { filename?: string }) {
  registerFonts();
  const blob = await pdf(<StatementDocument {...args} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = args.party.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.download = args.filename || `statement-${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
