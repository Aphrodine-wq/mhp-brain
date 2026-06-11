/**
 * Section 2: Project Estimation Sheet
 * DIV-by-DIV line items. Each division gets its own section with a table.
 * Table format: # | Line Item | Qty | Unit | Unit Price | Total
 * Division Total at bottom. Then an ESTIMATE TOTAL summary page.
 */
import type { DivisionGroup } from "./mhp-styles";
import { fmtCurrency, fmtCurrencyDec, fmtDec } from "./mhp-styles";

interface MHPEstimationSheetProps {
  divisions: DivisionGroup[];
  grandTotal: number;
  squareFootage: number | null;
  costPerSqft: number | null;
  s: any;
  View: any;
  Text: any;
}

export function MHPEstimationSheet({
  divisions,
  grandTotal,
  squareFootage,
  costPerSqft,
  s,
  View,
  Text,
}: MHPEstimationSheetProps) {
  return (
    <>
      {/* Each division */}
      {divisions.map((div) => (
        <View key={div.divisionNumber} wrap={false}>
          {/* Division heading */}
          <Text style={s.divisionTitle}>
            DIV {div.divisionNumber}: {div.divisionName}
          </Text>

          {/* Table header */}
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colNum]}>#</Text>
            <Text style={[s.tableHeaderText, s.colDesc]}>Line Item</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Qty</Text>
            <Text style={[s.tableHeaderText, s.colUnit]}>Unit</Text>
            <Text style={[s.tableHeaderText, s.colPrice]}>Unit Price</Text>
            <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
          </View>

          {/* Line items */}
          {div.items.map((li, idx) => {
            const qty = Number(li.quantity) || 0;
            const price = Number(li.unit_price) || 0;
            const extended = Number(li.extended_price) || qty * price;
            const lineNum = li.line_number
              ? (li.line_number % 1 === 0 ? String(li.line_number) : li.line_number.toFixed(2))
              : String(idx + 1);

            return (
              <View
                key={li.id ?? idx}
                style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}
              >
                <Text style={[s.tableCell, s.colNum]}>{lineNum}</Text>
                <Text style={[s.tableCell, s.colDesc]}>{li.description}</Text>
                <Text style={[s.tableCellRight, s.colQty]}>
                  {qty.toLocaleString("en-US")}
                </Text>
                <Text style={[s.tableCell, s.colUnit]}>{li.unit ?? ""}</Text>
                <Text style={[s.tableCellRight, s.colPrice]}>
                  {fmtCurrencyDec(price)}
                </Text>
                <Text style={[s.tableCellRight, s.colTotal]}>
                  {fmtCurrency(extended)}
                </Text>
              </View>
            );
          })}

          {/* Division total */}
          <View style={s.divisionTotalRow}>
            <Text style={s.divisionTotalLabel}>Division Total:</Text>
            <Text style={s.divisionTotalValue}>{fmtCurrency(div.total)}</Text>
          </View>
        </View>
      ))}

      {/* ESTIMATE TOTAL summary */}
      <View wrap={false}>
        <Text style={s.summaryTitle}>ESTIMATE TOTAL</Text>

        <View style={s.summaryTableHeader}>
          <Text style={[s.tableHeaderText, s.summaryColDiv]}>Division</Text>
          <Text style={[s.tableHeaderText, s.summaryColDesc]}>Description</Text>
          <Text style={[s.tableHeaderText, s.summaryColAmount]}>Amount</Text>
        </View>

        {divisions.map((div, idx) => (
          <View
            key={div.divisionNumber}
            style={[s.summaryRow, idx % 2 === 1 ? s.summaryRowAlt : {}]}
          >
            <Text style={[s.tableCell, s.summaryColDiv]}>DIV {div.divisionNumber}</Text>
            <Text style={[s.tableCell, s.summaryColDesc]}>{div.divisionName}</Text>
            <Text style={[s.tableCellRight, s.summaryColAmount]}>
              {fmtCurrency(div.total)}
            </Text>
          </View>
        ))}

        {/* Grand total */}
        <View style={s.summaryGrandRow}>
          <Text style={s.summaryGrandLabel}>**TOTAL ESTIMATE</Text>
          <Text style={s.summaryGrandValue}>**{fmtCurrency(grandTotal)}</Text>
        </View>

        {squareFootage && squareFootage > 0 ? (
          <View style={[s.summaryGrandRow, { marginTop: 0 }]}>
            <Text style={s.summaryGrandLabel}>
              **Cost Per Sqft ({squareFootage.toLocaleString("en-US")} sqft)
            </Text>
            <Text style={s.summaryGrandValue}>
              **${fmtDec(costPerSqft ?? grandTotal / squareFootage)}/sqft
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}
