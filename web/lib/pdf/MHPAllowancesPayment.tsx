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

export function MHPAllowancesPayment({
  finishGroups,
  allowanceTotal,
  grandTotal,
  s,
  View,
  Text,
}: MHPAllowancesPaymentProps) {
  // Canonical draw schedule — matches contract Article 2.3 and the HTML packet:
  // 20% deposit, two equal progress draws, 5% final. The last row absorbs rounding so
  // the rows always sum exactly to the printed total.
  const deposit = Math.round(grandTotal * 0.2);
  const finalPay = Math.round(grandTotal * 0.05);
  const draw1 = Math.round((grandTotal - deposit - finalPay) / 2);
  const draw2 = grandTotal - deposit - finalPay - draw1;
  const phases = [
    { label: "Initial Deposit (20% — due at signing)", amount: deposit },
    { label: "Progress Draw — Rough-in complete", amount: draw1 },
    { label: "Progress Draw — Finish complete", amount: draw2 },
    { label: "Final Payment (5% — at completion)", amount: finalPay },
  ];

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
