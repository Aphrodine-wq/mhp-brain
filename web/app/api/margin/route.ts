import { margin } from "@/lib/queries";

export async function GET() {
  return Response.json(await margin());
}
