import type { PdfStyles, PdfView, PdfText } from "./types";
/**
 * Section 1: Project Proposal Estimate
 * Company info, objective/scope narrative, construction divisions, exclusions,
 * time of completion, total with 30-day expiry.
 */
import type { Estimate, Client } from "./types";
import {
  COMPANY_LEGAL,
  COMPANY_ADDRESS,
  COMPANY_CITY_STATE,
  fmtCurrencyDec,
  type DivisionGroup,
} from "./mhp-styles";

interface MHPProposalProps {
  estimate: Estimate;
  client: Client | null;
  projectDesc: string;
  estimateDate: string;
  divisions: DivisionGroup[];
  s: PdfStyles;
  View: PdfView;
  Text: PdfText;
}

export function MHPProposal({
  estimate,
  client,
  projectDesc,
  estimateDate,
  divisions,
  s,
  View,
  Text,
}: MHPProposalProps) {
  const clientName = client?.full_name ?? "TBD, Owner";
  const projectAddress = estimate.project_address ?? "TBD";
  const sqft = estimate.square_footage ? `${estimate.square_footage.toLocaleString()} sqft` : "";

  return (
    <>
      {/* Company block */}
      <View style={s.companyBlock}>
        <Text style={s.companyName}>{COMPANY_LEGAL}</Text>
        <Text style={s.companyAddress}>{COMPANY_ADDRESS}</Text>
        <Text style={s.companyAddress}>{COMPANY_CITY_STATE}</Text>
      </View>

      {/* Project Estimate heading */}
      <Text style={s.sectionTitle}>Project Estimate</Text>

      {/* Info table */}
      <View style={s.infoTable}>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Date:</Text>
          <Text style={s.infoValue}>{estimateDate}</Text>
        </View>
        <View style={[s.infoRow, s.infoRowAlt]}>
          <Text style={s.infoLabel}>Prepared for:</Text>
          <Text style={s.infoValue}>{clientName}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Prepared by:</Text>
          <Text style={s.infoValue}>North MS Home Pros</Text>
        </View>
        <View style={[s.infoRow, s.infoRowAlt]}>
          <Text style={s.infoLabel}>Property Location:</Text>
          <Text style={s.infoValue}>{projectAddress}</Text>
        </View>
      </View>

      {/* Objective */}
      <Text style={s.sectionSubtitle}>Objective</Text>
      <Text style={s.bodyText}>
        This project bid includes all estimated materials and labor for the project with the scope of services defined as follows:
      </Text>
      {estimate.scope_inclusions.length > 0 ? (
        <Text style={s.bodyText}>
          {estimate.scope_inclusions.join(". ")}.
        </Text>
      ) : (
        <Text style={s.bodyText}>
          {projectDesc} {sqft ? `totaling ${sqft}` : ""} as specified in the detailed estimation sheet.
        </Text>
      )}

      {/* Construction Divisions Included */}
      <Text style={s.sectionSubtitle}>Construction Divisions Included</Text>
      {divisions.map((div) => (
        <View key={div.divisionNumber}>
          <Text style={s.divisionNameLabel}>
            {div.divisionName}:
          </Text>
          <Text style={s.divisionDescText}>
            {div.items.map((li) => li.description).join(", ")}
          </Text>
        </View>
      ))}

      {/* Exclusions */}
      {estimate.scope_exclusions.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Exclusions (NOT included)</Text>
          {estimate.scope_exclusions.map((item, i) => (
            <Text key={i} style={s.bulletItem}>
              -  {item}
            </Text>
          ))}
        </>
      )}

      {/* Time of Completion */}
      <Text style={s.sectionSubtitle}>Time of Completion</Text>
      {estimate.estimated_start && estimate.estimated_end ? (
        <Text style={s.bodyText}>
          Project Completion Estimation will be from{" "}
          {new Date(estimate.estimated_start).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}{" "}
          to{" "}
          {new Date(estimate.estimated_end).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
        </Text>
      ) : (
        <Text style={s.bodyText}>
          Project Completion Estimation will be 8-10 months from the date of project commencement.
        </Text>
      )}

      {/* Total with expiry */}
      <View style={s.proposalTotalBox} wrap={false}>
        <Text style={s.proposalTotalText}>
          Total Estimate for Scope of Work:   {fmtCurrencyDec(Number(estimate.grand_total))}*
        </Text>
        <Text style={s.proposalExpiryText}>
          *This proposal will expire 30 days after the date of the project estimate.
        </Text>
      </View>

      <Text style={s.proposalDisclaimerText}>
        Fee Terms and Conditions are contingent upon acceptance of the complete construction plans and final project budget. This preliminary project budget is provided for estimating purposes only and is subject to change upon completion of the project plans, specifications, and site conditions.
      </Text>
    </>
  );
}
