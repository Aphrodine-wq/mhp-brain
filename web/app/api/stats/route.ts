import { stats } from "@/lib/queries";

export async function GET() {
  return Response.json(await stats());
}
