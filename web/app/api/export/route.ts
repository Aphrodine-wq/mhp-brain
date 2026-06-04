import { writeXlsx } from "@/lib/xlsx";

interface InLine {
  description: string;
  qty?: number | string | null;
  rate?: number | string | null;
}

export async function POST(req: Request) {
  const data = await req.json();
  const lines = (data.lines ?? [])
    .filter((l: InLine) => l.qty && l.rate)
    .map((l: InLine) => ({ description: l.description, qty: Number(l.qty || 0), rate: Number(l.rate || 0) }));
  const buf = await writeXlsx(lines);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="MHP_Estimate.xlsx"',
    },
  });
}
