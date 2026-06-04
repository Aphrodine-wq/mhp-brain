import ExcelJS from "exceljs";
import path from "node:path";
import { canon } from "./canon";

// Faithful port of estimate.write_xlsx: fill a copy of the blank MHP template's input cells
// (C = qty, E = unit price). Excel recomputes Item Total / Markup / SOV formulas on open.
const TEMPLATE = path.join(process.cwd(), "templates", "mhp_template_blank.xlsx");

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((p) => p.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

export async function writeXlsx(lines: { description: string; qty: number; rate: number }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet("Template");
  if (!ws) throw new Error("Template sheet not found");

  // (canon description) -> row, for rows 7..182, skipping Division header rows
  const rowmap = new Map<string, number>();
  for (let r = 7; r <= 182; r++) {
    const s = cellText(ws.getCell(r, 2).value);
    if (s && !s.trim().toLowerCase().startsWith("division")) rowmap.set(canon(s), r);
  }

  for (const ln of lines) {
    const r = rowmap.get(canon(ln.description));
    if (r == null) continue;
    ws.getCell(r, 3).value = ln.qty; // C = qty
    ws.getCell(r, 5).value = ln.rate; // E = unit price (or lump total at qty 1)
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
