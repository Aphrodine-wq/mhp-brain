/**
 * MHP Bandominium Complete Estimate Package - PDF Generator
 *
 * 6-section PDF document:
 *   Cover Page
 *   Section 1: Project Proposal Estimate
 *   Section 2: Project Estimation Sheet (DIV-by-DIV)
 *   Section 3: Materials Allowance Worksheet + Payment Schedule
 *   Section 4: Prime Construction Contract
 *   Section 5: Change Order Log
 *
 * Uses @react-pdf/renderer. All imports are async to support code-splitting.
 */
import type { Estimate, EstimateLineItem, Client, EstimateChangeOrder } from "./types";
import {
  createMHPStyles,
  groupByDivision,
  PROJECT_TYPE_LABELS,
} from "./mhp-styles";
import { groupFinishSelections } from "@/lib/documents";
import { MHPPageHeader, MHPPageFooter } from "./MHPPageLayout";
import { MHPSectionDivider } from "./MHPSectionDivider";
import { MHPCoverPage } from "./MHPCoverPage";
import { MHPProposal } from "./MHPProposal";
import { MHPEstimationSheet } from "./MHPEstimationSheet";
import { MHPAllowancesPayment } from "./MHPAllowancesPayment";
import { MHPContract } from "./MHPContract";
import { MHPChangeOrders } from "./MHPChangeOrders";

/* ── Company info (pulled from settings or fallback) ── */

export interface CompanyInfo {
  name: string;
  address: string;
  city_state_zip: string;
  email: string;
  phone?: string;
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: "MHP Construction",
  address: "",
  city_state_zip: "",
  email: "info@mhpestimate.cloud",
};

/* ── Logo path ── */
const LOGO_PATH = typeof window !== "undefined" ? `${window.location.origin}/mhp-logo.png` : "/mhp-logo.png";

/* ── Build project description string ── */
function buildProjectDesc(estimate: Estimate): string {
  const name = estimate.estimate_name;
  const typeLabel = PROJECT_TYPE_LABELS[estimate.project_type] ?? estimate.project_type;
  const sqft = estimate.square_footage
    ? `${estimate.square_footage.toLocaleString()} sqft`
    : "";
  if (name) return sqft ? `${name} -- ${sqft}` : name;
  return sqft ? `${typeLabel} -- ${sqft}` : typeLabel;
}

/* ── Shared PDF document builder ── */

async function buildDoc(
  estimate: Estimate,
  lineItems: EstimateLineItem[],
  client: Client | null,
  _company: CompanyInfo,
  changeOrders: EstimateChangeOrder[] = []
) {
  const { Document, Page, Text, View, StyleSheet, Image } = await import("@react-pdf/renderer");

  const s = createMHPStyles(StyleSheet);
  const divisions = groupByDivision(lineItems);
  // Schedule A — the client-selectable finishes, grouped by selection category.
  // These lines already live in the estimate; this is a second view, not a charge.
  const finishGroups = groupFinishSelections(
    lineItems,
    (li) => li.description,
    (li) => Number(li.extended_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0),
  );
  const allowanceTotal = finishGroups.reduce((sum, g) => sum + g.total, 0);
  // Descriptions on Schedule A — used to flag the matching lines in the estimate sheet.
  const allowanceDescriptions = new Set(
    finishGroups.flatMap((g) => g.items.map((i) => i.description)),
  );
  const projectDesc = buildProjectDesc(estimate);

  const estimateDate = new Date(estimate.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const logoSrc = LOGO_PATH;

  // Shared header/footer props
  const headerFooterProps = {
    estimateNumber: estimate.estimate_number,
    projectDesc,
    logoSrc,
    s,
    View,
    Text,
    Image,
  };

  return (
    <Document>
      {/* ════════════════════════════════════════════════════════════
          COVER PAGE
          ════════════════════════════════════════════════════════════ */}
      <Page size="LETTER" style={s.pageCover}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPCoverPage
          estimate={estimate}
          projectDesc={projectDesc}
          estimateDate={estimateDate}
          lineItemCount={lineItems.length}
          divisionCount={divisions.length}
          logoSrc={logoSrc}
          s={s}
          View={View}
          Text={Text}
          Image={Image}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* ════════════════════════════════════════════════════════════
          SECTION 1: PROJECT PROPOSAL ESTIMATE
          ════════════════════════════════════════════════════════════ */}
      {/* Section divider page */}
      <Page size="LETTER" style={s.pageDivider}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPSectionDivider
          sectionNumber={1}
          title="PROJECT PROPOSAL ESTIMATE"
          subtitle={`${projectDesc} New Construction`}
          logoSrc={logoSrc}
          s={s}
          View={View}
          Text={Text}
          Image={Image}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* Proposal content */}
      <Page size="LETTER" style={s.page}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPProposal
          estimate={estimate}
          client={client}
          projectDesc={projectDesc}
          estimateDate={estimateDate}
          divisions={divisions}
          s={s}
          View={View}
          Text={Text}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* ════════════════════════════════════════════════════════════
          SECTION 2: PROJECT ESTIMATION SHEET
          ════════════════════════════════════════════════════════════ */}
      {/* Section divider page */}
      <Page size="LETTER" style={s.pageDivider}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPSectionDivider
          sectionNumber={2}
          title="PROJECT ESTIMATION SHEET"
          subtitle={`${lineItems.length} Line Items Across ${divisions.length} Divisions`}
          logoSrc={logoSrc}
          s={s}
          View={View}
          Text={Text}
          Image={Image}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* Estimation sheet content */}
      <Page size="LETTER" style={s.page}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPEstimationSheet
          divisions={divisions}
          grandTotal={Number(estimate.grand_total)}
          squareFootage={estimate.square_footage}
          costPerSqft={estimate.cost_per_sqft}
          allowanceDescriptions={allowanceDescriptions}
          s={s}
          View={View}
          Text={Text}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* ════════════════════════════════════════════════════════════
          SECTION 3: MATERIALS ALLOWANCE + PAYMENT SCHEDULE
          ════════════════════════════════════════════════════════════ */}
      {/* Section divider page */}
      <Page size="LETTER" style={s.pageDivider}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPSectionDivider
          sectionNumber={3}
          title="MATERIALS ALLOWANCE"
          subtitle="Owner Selection Items + Payment Schedule"
          logoSrc={logoSrc}
          s={s}
          View={View}
          Text={Text}
          Image={Image}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* Allowances + Payment content */}
      <Page size="LETTER" style={s.page}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPAllowancesPayment
          finishGroups={finishGroups}
          allowanceTotal={allowanceTotal}
          grandTotal={Number(estimate.grand_total)}
          s={s}
          View={View}
          Text={Text}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* ════════════════════════════════════════════════════════════
          SECTION 4: PRIME CONSTRUCTION CONTRACT
          ════════════════════════════════════════════════════════════ */}
      {/* Section divider page */}
      <Page size="LETTER" style={s.pageDivider}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPSectionDivider
          sectionNumber={4}
          title="PRIME CONSTRUCTION CONTRACT"
          subtitle="Fixed Cost with Allowances"
          logoSrc={logoSrc}
          s={s}
          View={View}
          Text={Text}
          Image={Image}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* Contract content */}
      <Page size="LETTER" style={s.page}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPContract
          estimate={estimate}
          client={client}
          projectDesc={projectDesc}
          s={s}
          View={View}
          Text={Text}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* ════════════════════════════════════════════════════════════
          SECTION 5: CHANGE ORDER LOG
          ════════════════════════════════════════════════════════════ */}
      {/* Section divider page */}
      <Page size="LETTER" style={s.pageDivider}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPSectionDivider
          sectionNumber={5}
          title="CHANGE ORDER LOG"
          subtitle="Tracking & Anticipated Changes"
          logoSrc={logoSrc}
          s={s}
          View={View}
          Text={Text}
          Image={Image}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>

      {/* Change orders content */}
      <Page size="LETTER" style={s.page}>
        <MHPPageHeader {...headerFooterProps} />
        <MHPChangeOrders
          estimateNumber={estimate.estimate_number}
          grandTotal={Number(estimate.grand_total)}
          changeOrders={changeOrders}
          s={s}
          View={View}
          Text={Text}
        />
        <MHPPageFooter estimateNumber={estimate.estimate_number} s={s} View={View} Text={Text} />
      </Page>
    </Document>
  );
}

/* ── Public API ── */

/** Download PDF to the browser. */
export async function generateEstimatePDF(
  estimate: Estimate,
  lineItems: EstimateLineItem[],
  client: Client | null,
  company?: CompanyInfo,
  changeOrders?: EstimateChangeOrder[]
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const doc = await buildDoc(estimate, lineItems, client, company ?? DEFAULT_COMPANY, changeOrders ?? []);
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${estimate.estimate_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Generate PDF and return a blob URL for in-browser preview. */
export async function generateEstimatePDFBlobUrl(
  estimate: Estimate,
  lineItems: EstimateLineItem[],
  client: Client | null,
  company?: CompanyInfo,
  changeOrders?: EstimateChangeOrder[]
): Promise<string> {
  const { pdf } = await import("@react-pdf/renderer");
  const doc = await buildDoc(estimate, lineItems, client, company ?? DEFAULT_COMPANY, changeOrders ?? []);
  const blob = await pdf(doc).toBlob();
  return URL.createObjectURL(blob);
}

/** Generate PDF as a base64 string for attaching to emails. */
export async function generateEstimatePDFBase64(
  estimate: Estimate,
  lineItems: EstimateLineItem[],
  client: Client | null,
  company?: CompanyInfo,
  changeOrders?: EstimateChangeOrder[]
): Promise<string> {
  const { pdf } = await import("@react-pdf/renderer");
  const doc = await buildDoc(estimate, lineItems, client, company ?? DEFAULT_COMPANY, changeOrders ?? []);
  const blob = await pdf(doc).toBlob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data:application/pdf;base64, prefix
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
