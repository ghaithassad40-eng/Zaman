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

// Register an Arabic-capable font so the store name / labels render correctly.
// If the CDN load fails (offline / blocked), we render with the default font.
let fontsRegistered = false;
let fontsRegisterFailed = false;
function registerFonts() {
  if (fontsRegistered || fontsRegisterFailed) return;
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
    fontsRegisterFailed = true;
  }
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#221c10" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  brand: { fontSize: 20, fontWeight: 700, color: "#9a7426" },
  brandSub: { fontSize: 11, color: "#9a7426" },
  title: { fontSize: 16, fontWeight: 700, textAlign: "right" },
  muted: { color: "#7a6e57" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  section: { marginTop: 14, marginBottom: 8 },
  twoCol: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginTop: 8 },
  box: { flex: 1, borderWidth: 1, borderColor: "#e7e0d1", borderRadius: 6, padding: 10 },
  boxLabel: { fontSize: 8, color: "#7a6e57", marginBottom: 4, textTransform: "uppercase" },
  table: { marginTop: 14, borderWidth: 1, borderColor: "#e7e0d1", borderRadius: 6 },
  thead: { flexDirection: "row", backgroundColor: "#f3efe6", borderBottomWidth: 1, borderColor: "#e7e0d1" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f1ead9" },
  th: { padding: 6, fontSize: 8, fontWeight: 700, color: "#4a3a18" },
  td: { padding: 6 },
  cDesc: { flex: 4 },
  cQty: { flex: 1, textAlign: "center" },
  cPrice: { flex: 2, textAlign: "right" },
  cTotal: { flex: 2, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: "48%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#e7e0d1", marginTop: 4, paddingTop: 6, fontSize: 12, fontWeight: 700, color: "#9a7426" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#7a6e57" },
});

export type InvoiceItem = { description: string; qty: number; unit_price: number; line_total: number };

function money(n: number) {
  return Number(n ?? 0).toFixed(3) + " JOD";
}

export function InvoiceDocument({
  invoice,
  items,
  company,
  customer,
}: {
  invoice: Tables<"invoices">;
  items: InvoiceItem[];
  company: Tables<"company_settings"> | null;
  customer: Tables<"customers"> | null;
}) {
  const pageStyle = fontsRegistered ? [styles.page, { fontFamily: "Amiri" }] : styles.page;
  return (
    <Document>
      <Page size="A4" style={pageStyle}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{(company?.name || "Zaman Watch").toUpperCase()}</Text>
            <Text style={styles.brandSub}>{company?.name_ar || "زمن للساعات"}</Text>
            {company?.tax_number ? (
              <Text style={[styles.muted, { marginTop: 4, fontSize: 9 }]}>
                Tax No. / الرقم الضريبي: {company.tax_number}
              </Text>
            ) : null}
            {company?.instagram_handle ? (
              <Text style={[styles.muted, { fontSize: 9 }]}>{company.instagram_handle}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.title}>Tax Invoice</Text>
            <Text style={[styles.title, { fontSize: 12 }]}>فاتورة ضريبية</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Invoice / فاتورة</Text>
            <View style={styles.metaRow}>
              <Text style={styles.muted}>No.</Text>
              <Text>{invoice.invoice_no}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.muted}>Date</Text>
              <Text>{invoice.issue_date}</Text>
            </View>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Bill to / فاتورة إلى</Text>
            <Text>{customer?.name ?? "—"}</Text>
            {customer?.phone ? <Text style={styles.muted}>{customer.phone}</Text> : null}
            {customer?.instagram_handle ? <Text style={styles.muted}>{customer.instagram_handle}</Text> : null}
            {customer?.address ? <Text style={styles.muted}>{customer.address}</Text> : null}
            {customer?.city ? <Text style={styles.muted}>{customer.city}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.cDesc]}>Description / الوصف</Text>
            <Text style={[styles.th, styles.cQty]}>Qty</Text>
            <Text style={[styles.th, styles.cPrice]}>Price</Text>
            <Text style={[styles.th, styles.cTotal]}>Total</Text>
          </View>
          {items.map((it, i) => (
            <View style={styles.tr} key={i}>
              <Text style={[styles.td, styles.cDesc]}>{it.description || "—"}</Text>
              <Text style={[styles.td, styles.cQty]}>{String(it.qty ?? 0)}</Text>
              <Text style={[styles.td, styles.cPrice]}>{money(it.unit_price)}</Text>
              <Text style={[styles.td, styles.cTotal]}>{money(it.line_total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Subtotal / المجموع</Text>
            <Text>{money(invoice.subtotal)}</Text>
          </View>
          {Number(invoice.discount) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Discount / الخصم</Text>
              <Text>- {money(invoice.discount)}</Text>
            </View>
          )}
          {Number(invoice.delivery_fee) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Delivery / التوصيل</Text>
              <Text>{money(invoice.delivery_fee)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.muted}>GST {Number(invoice.gst_rate)}% / ضريبة المبيعات</Text>
            <Text>{money(invoice.gst_amount)}</Text>
          </View>
          <View style={styles.grand}>
            <Text>Total / الإجمالي</Text>
            <Text>{money(invoice.total)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {`Thank you for shopping with ${company?.name || "Zaman Watch"} · شكراً لتسوقكم من ${company?.name_ar || "زمن للساعات"}`}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadInvoicePdf(args: {
  invoice: Tables<"invoices">;
  items: InvoiceItem[];
  company: Tables<"company_settings"> | null;
  customer: Tables<"customers"> | null;
}) {
  registerFonts();
  let blob: Blob;
  try {
    blob = await pdf(<InvoiceDocument {...args} />).toBlob();
  } catch (err) {
    // The Amiri CDN font may have failed to load — retry once with the
    // built-in font so the user still gets a usable invoice.
    const msg = (err as Error).message ?? "";
    if (msg.toLowerCase().includes("font") || msg.toLowerCase().includes("fetch")) {
      fontsRegisterFailed = true;
      blob = await pdf(<InvoiceDocument {...args} />).toBlob();
    } else {
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${args.invoice.invoice_no}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
