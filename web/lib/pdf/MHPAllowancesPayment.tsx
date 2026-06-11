/**
 * Section 3: Materials Allowance Worksheet + Payment Schedule
 * Owner allowance items table + payment schedule by construction phase.
 */
import type { EstimateLineItem } from "./types";
import { fmtCurrency, fmtCurrencyDec } from "./mhp-styles";

interface MHPAllowancesPaymentProps {
  allowanceItems: EstimateLineItem[];
  grandTotal: number;
  s: any;
  View: any;
  Text: any;
}

/** Default payment schedule phases (percentage of grand total) */
const PAYMENT_PHASES = [
  { label: "1. Project Mobilization (10%)", pct: 0.10 },
  { label: "2. Site Prep / Foundation / Slab", pct: 0.1224 },
  { label: "3. Metal Building Erection + Roofing / Exterior", pct: 0.1335 },
  { label: "4. Rough-in (HVAC / Electrical / Plumbing / Insulation)", pct: 0.1112 },
  { label: "5. Drywall + Interior Finish", pct: 0.1001 },
  { label: "6. Interior Trim / Cabinetry / Interior Painting", pct: 0.1001 },
  { label: "7. Countertops / Tile / Flooring", pct: 0.1001 },
  { label: "8. Appliances / MEP Top-out / Fixtures", pct: 0.0890 },
  { label: "9. Specialty Features / Fireplace / Wood Beams", pct: 0.0668 },
  { label: "10. Final Punchlist / Cleaning / CO", pct: 0 }, // remainder
];

export function MHPAllowancesPayment({
  allowanceItems,
  grandTotal,
  s,
  View,
  Text,
}: MHPAllowancesPaymentProps) {
  const totalAllowances = allowanceItems.reduce(
    (sum, li) =>
      sum + (Number(li.extended_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0)),
    0
  );

  // Calculate payment schedule amounts
  const phases = PAYMENT_PHASES.map((phase, idx) => {
    if (idx === PAYMENT_PHASES.length - 1) {
      // Last phase gets the remainder
      const usedPct = PAYMENT_PHASES.slice(0, -1).reduce((s, p) => s + p.pct, 0);
      return { label: phase.label, amount: Math.round(grandTotal * (1 - usedPct)) };
    }
    return { label: phase.label, amount: Math.round(grandTotal * phase.pct) };
  });

  return (
    <>
      {/* Owner Allowances */}
      <Text style={s.sectionTitle}>Owner Allowances</Text>

      <Text style={s.bodyText}>
        The following items are included in the contract as allowances. The owner will select specific products/materials. If selections exceed the allowance, the owner pays the difference. If under, the savings are credited to the owner.
      </Text>

      <View style={s.allowanceHeader}>
        <Text style={[s.tableHeaderText, s.allowanceColItem]}>Allowance Item</Text>
        <Text style={[s.tableHeaderText, s.allowanceColAmount]}>Budget Amount</Text>
      </View>

      {allowanceItems.map((li, idx) => {
        const extended = Number(li.extended_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
        return (
          <View
            key={li.id ?? idx}
            style={[s.allowanceRow, idx % 2 === 1 ? s.tableRowAlt : {}]}
          >
            <Text style={[s.tableCell, s.allowanceColItem]}>{li.description}</Text>
            <Text style={[s.tableCellRight, s.allowanceColAmount]}>
              {fmtCurrency(extended)}
            </Text>
          </View>
        );
      })}

      <View style={s.allowanceTotalRow}>
        <Text style={s.divisionTotalLabel}>Total Allowances:</Text>
        <Text style={s.divisionTotalValue}>{fmtCurrency(totalAllowances)}</Text>
      </View>

      {/* Payment Schedule */}
      <Text style={s.sectionTitle}>Payment Schedule</Text>

      <View style={s.paymentHeader}>
        <Text style={[s.tableHeaderText, s.paymentColPhase]}>Phase</Text>
        <Text style={[s.tableHeaderText, s.paymentColAmount]}>Amount</Text>
      </View>

      {phases.map((phase, idx) => (
        <View
          key={idx}
          style={[s.paymentRow, idx % 2 === 1 ? s.tableRowAlt : {}]}
        >
          <Text style={[s.tableCell, s.paymentColPhase]}>{phase.label}</Text>
          <Text style={[s.tableCellRight, s.paymentColAmount]}>
            {fmtCurrency(phase.amount)}
          </Text>
        </View>
      ))}

      <View style={s.paymentTotalRow}>
        <Text style={s.divisionTotalLabel}>Total:</Text>
        <Text style={s.divisionTotalValue}>{fmtCurrencyDec(grandTotal)}</Text>
      </View>
    </>
  );
}
