import type { PdfStyles, PdfView, PdfText } from "./types";
/**
 * Section 4: Construction Contract.
 * Renders MHP's canonical contract — buildContractArticles() from lib/documents, the
 * SAME source the in-app HTML client packet uses, so the two surfaces never diverge.
 * Amounts (total, allowance total) fill from the estimate; signature blocks below.
 */
import type { Estimate, Client } from "./types";
import { buildContractArticles, MHP_CONTRACTOR } from "@/lib/documents";
import { COMPANY_DBA } from "./mhp-styles";

interface MHPContractProps {
  estimate: Estimate;
  client: Client | null;
  allowanceTotal: number;
  projectDesc: string;
  s: PdfStyles;
  View: PdfView;
  Text: PdfText;
}

export function MHPContract({
  estimate,
  client,
  allowanceTotal,
  s,
  View,
  Text,
}: MHPContractProps) {
  const articles = buildContractArticles({
    total: Number(estimate.grand_total),
    allowanceTotal,
    clientName: client?.full_name ?? "",
    address: estimate.project_address ?? "",
  });

  return (
    <>
      {/* Title block */}
      <Text style={s.contractHeading}>{COMPANY_DBA}, LLC</Text>
      <Text style={s.contractSubheading}>Professional Services Construction Contract Agreement</Text>

      {/* Articles (canonical — shared with the HTML packet) */}
      {articles.map((a, i) => (
        <View key={i} wrap={false}>
          <Text style={s.clauseTitle}>{a.heading}</Text>
          <Text style={s.clauseBody}>{a.body}</Text>
        </View>
      ))}

      {/* Signature blocks */}
      <View style={s.signatureBlock} wrap={false}>
        <View style={s.signatureDateLine}>
          <View>
            <Text style={s.signatureLabel}>Owner Signature: _________________________________</Text>
          </View>
          <View>
            <Text style={s.signatureLabel}>Date: ____________</Text>
          </View>
        </View>
        <Text style={[s.signatureLabel, { marginTop: 8 }]}>
          {client?.full_name ? `${client.full_name}, Owner` : "Owner Name: _________________________________"}
        </Text>
      </View>

      <View style={s.signatureBlock} wrap={false}>
        <View style={s.signatureDateLine}>
          <View>
            <Text style={s.signatureLabel}>Contractor Signature: _________________________________</Text>
          </View>
          <View>
            <Text style={s.signatureLabel}>Date: ____________</Text>
          </View>
        </View>
        {MHP_CONTRACTOR.signers.map((sgn, i) => (
          <Text key={i} style={[s.clauseBody, i === 0 ? { marginTop: 8 } : {}]}>{sgn}</Text>
        ))}
        <Text style={s.clauseBody}>
          {MHP_CONTRACTOR.entity} · {MHP_CONTRACTOR.address} · {MHP_CONTRACTOR.license}
        </Text>
      </View>
    </>
  );
}
