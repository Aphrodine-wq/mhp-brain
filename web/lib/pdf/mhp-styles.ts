/**
 * MHP Bandominium Complete Estimate Package - Shared styles & constants.
 * Used by all 6 PDF section components.
 */
import type { EstimateLineItem } from "./types";

/* ── Color palette (matching template: cyan accent, dark text, clean minimal) ── */
export const MHP_CYAN = "#00bcd4";
export const MHP_CYAN_DARK = "#009faf";
export const DARK = "#1a1a1a";
export const GRAY_TEXT = "#667085";
export const GRAY_BG = "#f7f8fa";
export const GRAY_BORDER = "#d0d5dd";
export const GRAY_LIGHT = "#e8eaed";
export const WHITE = "#ffffff";

/* ── Company constants ── */
export const COMPANY_LEGAL = "Mississippi Home Professionals, LLC";
export const COMPANY_DBA = "North Mississippi Home Professionals";
export const COMPANY_ADDRESS = "404 Galleria Drive, Suite #6";
export const COMPANY_CITY_STATE = "Oxford, MS 38655";

export const CONTRACTOR_NAME = "Josh Harris";
export const CONTRACTOR_LICENSE = "R21909";
export const CONTRACTOR_ADDRESS = "1501 W. Jackson Ave., Suite 113 #144, Oxford, MS 38655";
export const CONTRACTOR_EMAIL = "info@mhpestimate.cloud";
export const CONTRACTOR_PHONE = "662-871-8071";

/* ── Helpers ── */
export function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtDec(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCurrency(n: number): string {
  return "$" + fmt(Math.round(n));
}

export function fmtCurrencyDec(n: number): string {
  return "$" + fmtDec(n);
}

export const TIER_LABELS: Record<string, string> = {
  budget: "Budget",
  midrange: "Midrange",
  high_end: "High End",
  good: "Budget",
  better: "Midrange",
  best: "High End",
};

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  porch: "Porch / Screened Porch",
  deck: "Deck / Outdoor Area",
  kitchen_renovation: "Kitchen Renovation",
  bathroom_renovation: "Bathroom Renovation",
  addition_remodel: "Home Addition / Remodel",
  guest_house: "Guest House / ADU",
  new_build: "New Home Build",
  garage_carport: "Garage / Carport",
  retaining_wall: "Retaining Wall",
  fencing: "Fencing",
  roofing: "Roofing",
  concrete_hardscape: "Concrete / Hardscape",
  door_window: "Door / Window Replacement",
  painting: "Painting (Interior/Exterior)",
  bonus_room: "Bonus Room Buildout",
  commercial: "Commercial Buildout / Renovation",
  infrastructure: "Infrastructure (Site/Utility)",
};

/* ── Division grouping ── */

export interface DivisionGroup {
  divisionNumber: string;
  divisionName: string;
  items: EstimateLineItem[];
  total: number;
}

// Pull the leading CSI number out of a division string ("Division 9: Finishes" → 9,
// "Division 22: Plumbing" → 22). Returns null when there's no number to parse.
function divNumberOf(division: string): number | null {
  const m = String(division ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Strip the "Division N:" prefix to get the human name ("Division 9: Finishes" →
// "Finishes"). Falls back to the raw string, then "Other".
function divNameOf(division: string): string {
  return String(division ?? "").replace(/^Division\s*\d+:\s*/i, "").trim() || division || "Other";
}

const lineAmount = (li: EstimateLineItem): number =>
  Number(li.extended_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);

/**
 * Group line items by their real CSI division — the `category` field carries the
 * full division string ("Division 9: Finishes") straight from the catalog, so we
 * group on that and parse the leading number ONLY for sort order + the "DIV N"
 * label. This is the standard CSI scheme the data actually uses; do NOT re-derive
 * divisions from floored line numbers (that mislabeled 9=Finishes as "Cabinetry"
 * and dropped 22/23/26/31–33 entirely).
 */
export function groupByDivision(lineItems: EstimateLineItem[]): DivisionGroup[] {
  const divMap = new Map<string, EstimateLineItem[]>();
  const order: string[] = []; // first-seen order, used as the tiebreak below

  for (const li of lineItems) {
    const key = li.category || "Other";
    if (!divMap.has(key)) {
      divMap.set(key, []);
      order.push(key);
    }
    divMap.get(key)!.push(li);
  }

  // Sort by CSI division number; numberless divisions sort last, in first-seen order.
  const sortedKeys = Array.from(divMap.keys()).sort((a, b) => {
    const na = divNumberOf(a);
    const nb = divNumberOf(b);
    if (na != null && nb != null) return na - nb;
    if (na != null) return -1;
    if (nb != null) return 1;
    return order.indexOf(a) - order.indexOf(b);
  });

  return sortedKeys.map((key) => {
    const items = divMap.get(key)!;
    // Stable in-division ordering by line_number (CSI item_no), original order on ties.
    items.sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

    const num = divNumberOf(key);
    return {
      divisionNumber: num != null ? String(num) : divNameOf(key),
      divisionName: divNameOf(key),
      items,
      total: items.reduce((sum, li) => sum + lineAmount(li), 0),
    };
  });
}

/**
 * Creates the shared MHP stylesheet for the entire PDF document.
 */
import type { PdfStyles } from "./types";

export function createMHPStyles(StyleSheet: { create: (styles: PdfStyles) => PdfStyles }): PdfStyles {
  return StyleSheet.create({
    /* ── Page ── */
    page: {
      fontFamily: "Helvetica",
      fontSize: 9,
      color: DARK,
      paddingTop: 80,
      paddingBottom: 50,
      paddingHorizontal: 40,
    },
    pageCover: {
      fontFamily: "Helvetica",
      fontSize: 9,
      color: DARK,
      paddingTop: 80,
      paddingBottom: 50,
      paddingHorizontal: 40,
    },
    pageDivider: {
      fontFamily: "Helvetica",
      fontSize: 9,
      color: DARK,
      paddingTop: 80,
      paddingBottom: 50,
      paddingHorizontal: 40,
      justifyContent: "center",
      alignItems: "center",
    },

    /* ── Fixed header ── */
    pageHeader: {
      position: "absolute",
      top: 20,
      left: 40,
      right: 40,
      flexDirection: "row",
      alignItems: "center",
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: MHP_CYAN,
    },
    pageHeaderLogo: {
      width: 60,
      height: 40,
      marginRight: 10,
    },
    pageHeaderCompany: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
    },
    pageHeaderMeta: {
      fontSize: 7,
      color: GRAY_TEXT,
    },
    pageHeaderRight: {
      marginLeft: "auto",
      textAlign: "right",
    },

    /* ── Fixed footer ── */
    pageFooter: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      borderTopWidth: 1,
      borderTopColor: MHP_CYAN,
      paddingTop: 6,
      flexDirection: "row",
      justifyContent: "center",
    },
    pageFooterText: {
      fontSize: 7,
      color: GRAY_TEXT,
      textAlign: "center",
    },

    /* ── Cover page ── */
    coverLogoContainer: {
      alignItems: "center",
      marginTop: 80,
      marginBottom: 20,
    },
    coverLogo: {
      width: 200,
      height: 140,
    },
    coverCompanyName: {
      fontSize: 28,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
      textAlign: "center",
      marginTop: 20,
    },
    coverSubtitle: {
      fontSize: 16,
      color: DARK,
      textAlign: "center",
      marginTop: 10,
    },
    coverProjectTitle: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      textAlign: "center",
      marginTop: 24,
    },
    coverProjectType: {
      fontSize: 12,
      color: DARK,
      textAlign: "center",
      marginTop: 4,
    },
    coverMeta: {
      fontSize: 10,
      color: DARK,
      textAlign: "center",
      marginTop: 8,
    },
    coverTOC: {
      marginTop: 40,
      alignItems: "center",
    },
    coverTOCTitle: {
      fontSize: 9,
      color: GRAY_TEXT,
      marginBottom: 8,
    },
    coverTOCItem: {
      fontSize: 10,
      color: DARK,
      textAlign: "center",
      marginBottom: 4,
    },

    /* ── Section divider ── */
    dividerLogoContainer: {
      alignItems: "center",
      marginBottom: 30,
    },
    dividerLogo: {
      width: 180,
      height: 126,
    },
    dividerTitle: {
      fontSize: 28,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
      textAlign: "center",
      marginBottom: 12,
    },
    dividerSubtitle: {
      fontSize: 14,
      color: DARK,
      textAlign: "center",
      marginBottom: 16,
    },
    dividerSectionNumber: {
      fontSize: 10,
      color: GRAY_TEXT,
      textAlign: "center",
    },

    /* ── Proposal section ── */
    companyBlock: {
      marginBottom: 12,
    },
    companyName: {
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      color: DARK,
    },
    companyAddress: {
      fontSize: 9,
      color: DARK,
      lineHeight: 1.5,
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
      marginTop: 16,
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: GRAY_LIGHT,
      paddingBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      marginTop: 12,
      marginBottom: 6,
    },
    bodyText: {
      fontSize: 9,
      color: DARK,
      lineHeight: 1.6,
      marginBottom: 4,
    },
    bulletItem: {
      fontSize: 9,
      color: DARK,
      lineHeight: 1.6,
      paddingLeft: 12,
      marginBottom: 2,
    },

    /* ── Info table (label/value pairs) ── */
    infoTable: {
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
      paddingVertical: 4,
    },
    infoRowAlt: {
      backgroundColor: GRAY_BG,
    },
    infoLabel: {
      fontSize: 9,
      color: DARK,
      width: "40%",
      paddingLeft: 4,
    },
    infoValue: {
      fontSize: 9,
      color: DARK,
      width: "60%",
    },

    /* ── Division header (table header row with cyan background) ── */
    divisionTitle: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      marginTop: 6,
      marginBottom: 6,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: MHP_CYAN,
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    tableHeaderText: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: WHITE,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
    },
    tableRowAlt: {
      backgroundColor: GRAY_BG,
    },
    tableCell: {
      fontSize: 8,
      color: DARK,
    },
    tableCellRight: {
      fontSize: 8,
      color: DARK,
      textAlign: "right",
    },
    tableCellBold: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: DARK,
    },

    /* Column widths for line items table */
    colNum: { width: "8%" },
    colDesc: { width: "40%" },
    colQty: { width: "12%", textAlign: "right" },
    colUnit: { width: "10%" },
    colPrice: { width: "15%", textAlign: "right" },
    colTotal: { width: "15%", textAlign: "right" },

    /* Division total row */
    divisionTotalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingVertical: 6,
      paddingHorizontal: 6,
      marginBottom: 8,
    },
    divisionTotalLabel: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
      marginRight: 16,
    },
    divisionTotalValue: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
    },

    /* ── Estimate total summary table ── */
    summaryTitle: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
      marginTop: 10,
      marginBottom: 16,
    },
    summaryTableHeader: {
      flexDirection: "row",
      backgroundColor: MHP_CYAN,
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    summaryRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
    },
    summaryRowAlt: {
      backgroundColor: GRAY_BG,
    },
    summaryColDiv: { width: "15%" },
    summaryColDesc: { width: "60%" },
    summaryColAmount: { width: "25%", textAlign: "right" },
    summaryGrandRow: {
      flexDirection: "row",
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginTop: 4,
    },
    summaryGrandLabel: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      width: "75%",
    },
    summaryGrandValue: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      width: "25%",
      textAlign: "right",
    },

    /* ── Proposal total bar ── */
    proposalTotalBox: {
      marginTop: 20,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: GRAY_BG,
      borderWidth: 1,
      borderColor: GRAY_BORDER,
      borderRadius: 2,
      alignItems: "center",
    },
    proposalTotalText: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      textAlign: "center",
    },
    proposalExpiryText: {
      fontSize: 9,
      color: DARK,
      textAlign: "center",
      marginTop: 8,
    },
    proposalDisclaimerText: {
      fontSize: 8,
      color: GRAY_TEXT,
      textAlign: "left",
      marginTop: 12,
      lineHeight: 1.5,
    },

    /* ── Allowance / finish-selection schedule ── */
    allowanceHeader: {
      flexDirection: "row",
      backgroundColor: MHP_CYAN,
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    // Three-column layout: finish item · budget allowance · owner's selection (blank).
    allowanceColItem: { width: "46%" },
    allowanceColAmount: { width: "22%", textAlign: "right" },
    allowanceColSelect: { width: "32%", paddingLeft: 8 },
    allowanceRow: {
      flexDirection: "row",
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
      alignItems: "flex-end",
    },
    // Category subhead band that opens each finish group.
    allowanceCategoryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: GRAY_LIGHT,
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginTop: 8,
    },
    allowanceCategoryName: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: DARK,
    },
    allowanceCategoryTotal: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: GRAY_TEXT,
    },
    // The write-in line in the selection column.
    allowanceSelectLine: {
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
      minHeight: 10,
    },
    allowanceTotalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: MHP_CYAN,
    },
    reconcileNote: {
      fontSize: 8,
      color: GRAY_TEXT,
      lineHeight: 1.5,
      marginTop: 8,
      marginBottom: 16,
    },

    /* ── Payment schedule ── */
    paymentHeader: {
      flexDirection: "row",
      backgroundColor: MHP_CYAN,
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    paymentColPhase: { width: "75%" },
    paymentColAmount: { width: "25%", textAlign: "right" },
    paymentRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
    },
    paymentTotalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginTop: 4,
    },

    /* ── Contract ── */
    contractHeading: {
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      textAlign: "center",
      marginBottom: 4,
    },
    contractSubheading: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      textAlign: "center",
      marginBottom: 16,
    },
    clauseTitle: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: MHP_CYAN,
      marginTop: 10,
      marginBottom: 3,
    },
    clauseBody: {
      fontSize: 8,
      color: DARK,
      lineHeight: 1.6,
      marginBottom: 4,
      textAlign: "justify",
    },
    signatureLine: {
      borderBottomWidth: 0.5,
      borderBottomColor: DARK,
      width: 220,
      marginTop: 20,
      marginBottom: 4,
    },
    signatureLabel: {
      fontSize: 8,
      color: GRAY_TEXT,
      marginBottom: 2,
    },
    signatureDateLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 16,
    },
    signatureBlock: {
      marginBottom: 16,
    },

    /* ── Change order ── */
    coStatusRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
    },
    coStatusLabel: {
      fontSize: 9,
      color: DARK,
      width: "50%",
    },
    coStatusValue: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: DARK,
      width: "50%",
    },
    coAnticipatedHeader: {
      flexDirection: "row",
      backgroundColor: MHP_CYAN,
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    coAnticipatedColItem: { width: "65%" },
    coAnticipatedColRange: { width: "35%", textAlign: "right" },
    coAnticipatedRow: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: GRAY_BORDER,
    },
    coFormBox: {
      borderWidth: 0.5,
      borderColor: GRAY_BORDER,
      padding: 12,
      marginTop: 10,
    },
    coFormText: {
      fontSize: 8,
      fontFamily: "Courier",
      color: DARK,
      lineHeight: 1.8,
    },

    /* ── Division name label blocks ── */
    divisionNameLabel: {
      fontFamily: "Helvetica-Bold",
      fontSize: 9,
      color: DARK,
      marginBottom: 2,
    },
    divisionDescText: {
      fontSize: 8,
      color: GRAY_TEXT,
      paddingLeft: 8,
      lineHeight: 1.5,
      marginBottom: 4,
    },

    /* ── Inline marker on estimate lines that map to Schedule A ── */
    allowanceMarker: {
      fontSize: 7,
      fontFamily: "Helvetica-Oblique",
      color: MHP_CYAN_DARK,
    },
  });
}
