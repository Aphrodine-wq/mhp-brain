import { catalogList } from "@/lib/queries";

export async function GET() {
  return Response.json(await catalogList());
}
