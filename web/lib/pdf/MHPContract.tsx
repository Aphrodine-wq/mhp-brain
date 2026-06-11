/**
 * Section 4: Prime Construction Contract
 * Full contract text, fixed cost with allowances, standard clauses,
 * dual signature blocks.
 */
import type { Estimate, Client } from "./types";
import {
  COMPANY_DBA,
  COMPANY_LEGAL,
  CONTRACTOR_NAME,
  CONTRACTOR_LICENSE,
  CONTRACTOR_ADDRESS,
  CONTRACTOR_EMAIL,
  CONTRACTOR_PHONE,
  fmtCurrencyDec,
} from "./mhp-styles";

interface MHPContractProps {
  estimate: Estimate;
  client: Client | null;
  projectDesc: string;
  s: any;
  View: any;
  Text: any;
}

export function MHPContract({
  estimate,
  client,
  projectDesc,
  s,
  View,
  Text,
}: MHPContractProps) {
  const total = fmtCurrencyDec(Number(estimate.grand_total));
  const deposit = fmtCurrencyDec(Number(estimate.grand_total) * 0.10);
  const year = new Date(estimate.created_at).getFullYear();
  const projectAddress = estimate.project_address ?? "________________________";

  return (
    <>
      {/* Title block */}
      <Text style={s.contractHeading}>
        {COMPANY_DBA}, LLC
      </Text>
      <Text style={s.contractSubheading}>PRIME CONSTRUCTION CONTRACT</Text>

      {/* Preamble */}
      <Text style={s.clauseBody}>
        THIS CONTRACT IS ENTERED INTO THE _____ DAY OF _________ {year}, by and between {COMPANY_DBA}, LLC. Dba {COMPANY_LEGAL}, hereafter "Contractor" and {client?.full_name ?? "________________________"} hereafter "Owner".
      </Text>
      <Text style={s.clauseBody}>
        The Contractor is a Mississippi Limited Liability Company qualified and doing business in the State of Mississippi.
      </Text>
      <Text style={s.clauseBody}>
        For valuable consideration of {total} the parties do hereby agree:
      </Text>

      {/* SCOPE OF WORK */}
      <Text style={s.clauseTitle}>SCOPE OF WORK:</Text>
      <Text style={s.clauseBody}>
        Contractor shall provide all labor and materials and shall construct for Owners the residence as described by the plans and specifications. {projectDesc}.
      </Text>

      {/* CONTRACT AMOUNT */}
      <Text style={s.clauseTitle}>CONTRACT AMOUNT:</Text>
      <Text style={s.clauseBody}>
        Owner shall pay to Contractor for the performance of this Contract the following amount of consideration: {total} with a total Deposit of {deposit} (10%) paid prior to commencement. Balance per payment schedule attached.
      </Text>

      {/* FIXED COST WITH ALLOWANCES */}
      <Text style={s.clauseTitle}>FIXED COST WITH ALLOWANCES:</Text>
      <Text style={s.clauseBody}>
        The fixed cost contract guarantees that the total price for the project will remain constant, covering all labor, materials, and services as outlined. However, allowances are included for specific items the owner will select. If selections exceed allowance amounts, the additional cost is borne by the owner. If under, savings are credited to the owner.
      </Text>

      {/* WORK SITE */}
      <Text style={s.clauseTitle}>WORK SITE:</Text>
      <Text style={s.clauseBody}>
        The Project shall be constructed on the property of the Owner located at {projectAddress}.
      </Text>

      {/* TIME OF COMPLETION */}
      <Text style={s.clauseTitle}>TIME OF COMPLETION:</Text>
      <Text style={s.clauseBody}>
        Contractor shall commence work upon issuance of a written Notice to Proceed. Estimated completion: 8-10 months from commencement. Subject to weather delays, material lead times, and owner selection timelines.
      </Text>

      {/* PLAN DEFECT CLAUSE */}
      <Text style={s.clauseTitle}>PLAN DEFECT CLAUSE:</Text>
      <Text style={s.clauseBody}>
        In the event of a defect in the plans or specifications, the parties agree to negotiate a Change Order to provide reasonable additional costs and schedule adjustments.
      </Text>

      {/* MARKET FLUCTUATION CLAUSE */}
      <Text style={s.clauseTitle}>MARKET FLUCTUATION CLAUSE:</Text>
      <Text style={s.clauseBody}>
        The parties agree to negotiate a Change Order to address significant price fluctuations in materials or labor costs resulting from market conditions.
      </Text>

      {/* SOLE DISCRETION CLAUSE */}
      <Text style={s.clauseTitle}>SOLE DISCRETION CLAUSE:</Text>
      <Text style={s.clauseBody}>
        The owner recognizes that the General Contractor shall have sole discretion in the planning, execution, and management of all construction activities.
      </Text>

      {/* PERMITS */}
      <Text style={s.clauseTitle}>PERMITS:</Text>
      <Text style={s.clauseBody}>
        The contractor shall obtain all required permits; cost included up to $4,200 allowance. Costs exceeding this are the owner's responsibility.
      </Text>

      {/* SOIL CONDITIONS */}
      <Text style={s.clauseTitle}>SOIL CONDITIONS:</Text>
      <Text style={s.clauseBody}>
        The contractor shall have no responsibility for soil conditions. Any required excavation, fill, or special footings shall be a Change Order.
      </Text>

      {/* INSURANCE */}
      <Text style={s.clauseTitle}>INSURANCE:</Text>
      <Text style={s.clauseBody}>
        Contractor shall maintain general liability, workers compensation, and commercial automotive insurance. Owner shall provide homeowner's insurance prior to commencement.
      </Text>

      {/* SURVEY AND TITLE */}
      <Text style={s.clauseTitle}>SURVEY AND TITLE:</Text>
      <Text style={s.clauseBody}>
        Prior to construction, Owner shall provide boundary survey, title opinion/insurance, and current tax receipt.
      </Text>

      {/* ACT OF FORCE MAJEURE */}
      <Text style={s.clauseTitle}>ACT OF FORCE MAJEURE:</Text>
      <Text style={s.clauseBody}>
        Neither party shall be liable for failure to perform due to extraordinary, unforeseeable and unavoidable causes beyond their control.
      </Text>

      {/* CHANGES TO SCOPE */}
      <Text style={s.clauseTitle}>CHANGES TO SCOPE:</Text>
      <Text style={s.clauseBody}>
        All changes must be documented in a written Change Order signed by both parties prior to work commencing.
      </Text>

      {/* LATE PAYMENT */}
      <Text style={s.clauseTitle}>LATE PAYMENT:</Text>
      <Text style={s.clauseBody}>
        Owner agrees to pay 2.5% late charge on payments more than 10 days late plus collection costs. Contractor may suspend work if payment is 30+ days overdue.
      </Text>

      {/* WARRANTY */}
      <Text style={s.clauseTitle}>WARRANTY:</Text>
      <Text style={s.clauseBody}>
        One (1) year warranty from date of Certificate of Occupancy on all workmanship within the scope of work. Does not cover normal wear, owner modifications, or third-party damage.
      </Text>

      {/* Contractor signature block */}
      <View style={s.signatureBlock} wrap={false}>
        <View style={s.signatureDateLine}>
          <View>
            <Text style={s.signatureLabel}>Contractor Signature: _________________________________</Text>
          </View>
          <View>
            <Text style={s.signatureLabel}>Date: ____________</Text>
          </View>
        </View>

        <Text style={[s.clauseBody, { marginTop: 8 }]}>
          {CONTRACTOR_NAME}, Contractor - {CONTRACTOR_LICENSE}
        </Text>
        <Text style={s.clauseBody}>{CONTRACTOR_ADDRESS}</Text>
        <Text style={s.clauseBody}>
          Email: {CONTRACTOR_EMAIL}  |  Phone: {CONTRACTOR_PHONE}
        </Text>
      </View>

      {/* Owner signature block */}
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
          Owner Name: _________________________________
        </Text>
        <Text style={s.signatureLabel}>
          Address: _________________________________
        </Text>
        <Text style={s.signatureLabel}>
          Email: _________________________________  |  Phone: _________________________________
        </Text>
      </View>
    </>
  );
}
