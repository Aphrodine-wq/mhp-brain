import type { PdfStyles, PdfView, PdfText } from "./types";
/**
 * Section 5: Change Order Log
 * CO status tracking, anticipated common change orders with cost ranges,
 * blank CO form template.
 */
import type { EstimateChangeOrder } from "./types";
import { fmtCurrency } from "./mhp-styles";

interface MHPChangeOrdersProps {
  estimateNumber: string;
  grandTotal: number;
  changeOrders: EstimateChangeOrder[];
  s: PdfStyles;
  View: PdfView;
  Text: PdfText;
}

/** Common change orders for construction projects */
const ANTICIPATED_COS = [
  { item: "Foundation engineering changes (soil)", range: "$2,500 - $8,000" },
  { item: "HVAC upgrade - full mini-split system", range: "+$4,000 - $7,000" },
  { item: "Window package upgrade (wood-clad/impact)", range: "+$3,500 - $8,000" },
  { item: "Standing seam roof upgrade (vs R-panel)", range: "+$5,500 - $9,000" },
  { item: "Spray foam - additional thickness", range: "+$2,500 - $4,500" },
  { item: "Additional sheetrock / wall changes", range: "+$1,500 - $4,000" },
  { item: "Electrical panel upgrade to 400A", range: "+$2,200 - $3,500" },
  { item: "Cabinetry upgrade (full-custom)", range: "+$4,000 - $10,000" },
  { item: "Flooring upgrade (hardwood vs LVP)", range: "+$4,000 - $12,000" },
  { item: "Countertop upgrade (exotic slab)", range: "+$2,000 - $5,500" },
  { item: "Plumbing fixture upgrade (premium)", range: "+$2,000 - $4,500" },
  { item: "Septic system design + installation", range: "$8,000 - $18,000" },
  { item: "Concrete stained/scored floors (in lieu of LVP)", range: "-$2,000 - +$3,000" },
  { item: "Covered back porch addition", range: "$6,500 - $12,000" },
  { item: "Shop / additional outbuilding", range: "Separate estimate" },
  { item: "Additional sodding / landscaping", range: "$1,500 - $5,000" },
  { item: "Privacy fence", range: "$4,000 - $9,000" },
];

export function MHPChangeOrders({
  estimateNumber,
  grandTotal,
  changeOrders,
  s,
  View,
  Text,
}: MHPChangeOrdersProps) {
  const approvedCOs = changeOrders.filter((co) => co.status === "approved");
  const totalCOImpact = approvedCOs.reduce((sum, co) => sum + Number(co.cost_impact), 0);
  const revisedTotal = grandTotal + totalCOImpact;

  return (
    <>
      {/* Change Order Status */}
      <Text style={s.sectionTitle}>Change Order Status</Text>

      <View style={s.coStatusRow}>
        <Text style={s.coStatusLabel}>Original Contract Amount</Text>
        <Text style={s.coStatusValue}>{fmtCurrency(grandTotal)}</Text>
      </View>
      <View style={[s.coStatusRow, s.infoRowAlt]}>
        <Text style={s.coStatusLabel}>Total Approved Change Orders</Text>
        <Text style={s.coStatusValue}>{fmtCurrency(totalCOImpact)}</Text>
      </View>
      <View style={s.coStatusRow}>
        <Text style={s.coStatusLabel}>Revised Contract Amount</Text>
        <Text style={s.coStatusValue}>{fmtCurrency(revisedTotal)}</Text>
      </View>

      {/* Approved Change Orders */}
      <Text style={s.sectionSubtitle}>Approved Change Orders</Text>
      {approvedCOs.length > 0 ? (
        <>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, { width: "10%" }]}>#</Text>
            <Text style={[s.tableHeaderText, { width: "50%" }]}>Description</Text>
            <Text style={[s.tableHeaderText, { width: "20%" }]}>Timeline</Text>
            <Text style={[s.tableHeaderText, { width: "20%", textAlign: "right" }]}>Cost Impact</Text>
          </View>
          {approvedCOs.map((co, idx) => (
            <View key={co.id ?? idx} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, { width: "10%" }]}>CO #{co.change_number}</Text>
              <Text style={[s.tableCell, { width: "50%" }]}>{co.description}</Text>
              <Text style={[s.tableCell, { width: "20%" }]}>{co.timeline_impact ?? "N/A"}</Text>
              <Text style={[s.tableCellRight, { width: "20%" }]}>
                {co.cost_impact >= 0 ? "+" : ""}{fmtCurrency(Number(co.cost_impact))}
              </Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={s.bodyText}>None at this time.</Text>
      )}

      {/* Anticipated Common Change Orders */}
      <Text style={s.sectionTitle}>Common Change Orders to Anticipate</Text>
      <Text style={s.bodyText}>
        The following items are common on construction projects and are NOT included in the base estimate:
      </Text>

      <View style={s.coAnticipatedHeader}>
        <Text style={[s.tableHeaderText, s.coAnticipatedColItem]}>Potential Change Order</Text>
        <Text style={[s.tableHeaderText, s.coAnticipatedColRange]}>Estimated Range</Text>
      </View>

      {ANTICIPATED_COS.map((co, idx) => (
        <View key={idx} style={[s.coAnticipatedRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
          <Text style={[s.tableCell, s.coAnticipatedColItem]}>{co.item}</Text>
          <Text style={[s.tableCellRight, s.coAnticipatedColRange]}>{co.range}</Text>
        </View>
      ))}

      {/* Blank CO Form */}
      <View wrap={false}>
        <Text style={s.sectionTitle}>Change Order Form</Text>

        <View style={s.coFormBox}>
          <Text style={s.coFormText}>CHANGE ORDER # ____</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>Project: {estimateNumber}</Text>
          <Text style={s.coFormText}>Date: ___________       Owner: ___________</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>DESCRIPTION OF CHANGE:</Text>
          <Text style={s.coFormText}>____________________________________________________</Text>
          <Text style={s.coFormText}>____________________________________________________</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>REASON: [ ] Owner Request  [ ] Unforeseen Conditions</Text>
          <Text style={s.coFormText}>        [ ] Design Change  [ ] Code Requirement</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>COST IMPACT:</Text>
          <Text style={s.coFormText}>  Materials: $_________   Labor: $_________</Text>
          <Text style={s.coFormText}>  Total CO:  $_________</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>SCHEDULE IMPACT: ___ days</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>ORIGINAL CONTRACT:     {fmtCurrency(grandTotal)}</Text>
          <Text style={s.coFormText}>PREVIOUS COs:          $_________</Text>
          <Text style={s.coFormText}>THIS CHANGE ORDER:     $_________</Text>
          <Text style={s.coFormText}>REVISED CONTRACT:      $_________</Text>
          <Text style={s.coFormText}>{" "}</Text>
          <Text style={s.coFormText}>Owner Signature: _______________   Date: _______</Text>
          <Text style={s.coFormText}>MHP Signature:   _______________   Date: _______</Text>
        </View>
      </View>
    </>
  );
}
