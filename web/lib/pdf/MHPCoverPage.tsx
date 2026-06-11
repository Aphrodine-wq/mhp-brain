/**
 * Section 1: Cover Page
 * MHP logo, "Construction Estimate Package", project title, estimate #, date, total, TOC.
 */
import type { Estimate } from "./types";
import { fmtCurrencyDec, PROJECT_TYPE_LABELS } from "./mhp-styles";

interface MHPCoverPageProps {
  estimate: Estimate;
  projectDesc: string;
  estimateDate: string;
  lineItemCount: number;
  divisionCount: number;
  logoSrc: string | null;
  s: any;
  View: any;
  Text: any;
  Image: any;
}

export function MHPCoverPage({
  estimate,
  projectDesc,
  estimateDate,
  lineItemCount,
  divisionCount,
  logoSrc,
  s,
  View,
  Text,
  Image,
}: MHPCoverPageProps) {
  const projectTypeLabel = PROJECT_TYPE_LABELS[estimate.project_type] ?? estimate.project_type;

  return (
    <>
      {/* Logo */}
      <View style={s.coverLogoContainer}>
        {logoSrc ? (
          <Image src={logoSrc} style={s.coverLogo} />
        ) : null}
      </View>

      {/* Company name */}
      <Text style={s.coverCompanyName}>MHP CONSTRUCTION</Text>

      {/* Subtitle */}
      <Text style={s.coverSubtitle}>Construction Estimate Package</Text>

      {/* Project title */}
      <Text style={s.coverProjectTitle}>{projectDesc}</Text>
      <Text style={s.coverProjectType}>{projectTypeLabel}</Text>

      {/* Meta */}
      <Text style={s.coverMeta}>Estimate #: {estimate.estimate_number}</Text>
      <Text style={s.coverMeta}>Date: {estimateDate}</Text>
      <Text style={s.coverMeta}>Total Estimate: {fmtCurrencyDec(Number(estimate.grand_total))}</Text>

      {/* Table of Contents */}
      <View style={s.coverTOC}>
        <Text style={s.coverTOCTitle}>Table of Contents</Text>
        <Text style={s.coverTOCItem}>Section 1:  Project Proposal Estimate</Text>
        <Text style={s.coverTOCItem}>
          Section 2:  Project Estimation Sheet ({lineItemCount} Line Items)
        </Text>
        <Text style={s.coverTOCItem}>
          Section 3:  Materials Allowance Worksheet + Payment Schedule
        </Text>
        <Text style={s.coverTOCItem}>Section 4:  Prime Construction Contract</Text>
        <Text style={s.coverTOCItem}>Section 5:  Change Order Log</Text>
      </View>
    </>
  );
}
