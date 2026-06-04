import { subsList } from "@/lib/queries";

export async function GET() {
  return Response.json(await subsList());
}
