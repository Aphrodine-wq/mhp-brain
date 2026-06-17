/**
 * Section 3: Finish Selections & Allowance Schedule (Schedule A) + Payment Schedule.
 * The finish schedule is grouped by selection category (cabinetry, counters,
 * flooring, fixtures, ...) with a budgeted allowance and a blank column the owner
 * fills in with their actual selection. These lines are already priced in the
 * estimate — this is a second VIEW of them, not a second charge.
 */
import type { FinishGroup } from "@/lib/documents";
import { fmtCurrency, fmtCurrencyDec } from "./mhp-styles";

interface MHPAllowancesPaymentProps {
  finishGroups: FinishGroup[];
  allowanceTotal: number;
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
  finishGroups,
  allowanceTotal,
  grandTotal,
  s,
  View,
  Text,
}: MHPAllowancesPaymentProps) {
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
      {/* ── Finish Selections & Allowance Schedule (Schedule A) ── */}
      <Text style={s.sectionTitle}>Finish Selections &amp; Allowance Schedule</Text>

      <Text style={s.bodyText}>
        The budgets below are carried in the contract for the finishes you select. Make your selections within each
        budget; if a selection comes in over its allowance, the difference is added by change order (plus 12% overhead
        and profit), and any amount under is credited back to you. Use the right column to record your selection.
      </Text>

      {finishGroups.length === 0 ? (
        <Text style={s.bodyText}>No selection-dependent finishes on this estimate.</Text>
      ) : (
        <>
          {/* Column header */}
          <View style={s.allowanceHeader}>
            <Text style={[s.tableHeaderText, s.allowanceColItem]}>Finish Item</Text>
            <Text style={[s.tableHeaderText, s.allowanceColAmount]}>Budget Allowance</Text>
            <Text style={[s.tableHeaderText, s.allowanceColSelect]}>Your Selection</Text>
          </View>

          {finishGroups.map((group) => (
            <View key={group.category} wrap={false}>
              {/* Category subhead */}
              <View style={s.allowanceCategoryRow}>
                <Text style={s.allowanceCategoryName}>{group.category}</Text>
                <Text style={s.allowanceCategoryTotal}>{fmtCurrency(group.total)}</Text>
              </View>

              {/* Items */}
              {group.items.map((item, idx) => (
                <View key={idx} style={[s.allowanceRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, s.allowanceColItem]}>{item.description}</Text>
                  <Text style={[s.tableCellRight, s.allowanceColAmount]}>{fmtCurrency(item.amount)}</Text>
                  <View style={[s.allowanceColSelect]}>
                    <View style={s.allowanceSelectLine} />
                  </View>
                </View>
              ))}
            </View>
          ))}

          {/* Grand total */}
          <View style={s.allowanceTotalRow}>
            <Text style={s.divisionTotalLabel}>Total Allowances Carried:</Text>
            <Text style={s.divisionTotalValue}>{fmtCurrency(allowanceTotal)}</Text>
          </View>

          <Text style={s.reconcileNote}>
            Allowances are included in the contract price and reconciled to your actual selections at the time they are
            made. Over-allowance selections are billed by signed change order at cost plus 12%; under-allowance savings
            are credited in the final payment. No markup games — just the real number.
          </Text>
        </>
      )}

      {/* ── Payment Schedule ── */}
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
