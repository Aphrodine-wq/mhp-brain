import { projectsList } from "@/lib/queries";

export async function GET() {
  return Response.json(await projectsList());
}
