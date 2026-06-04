import { currentUser } from "@/lib/auth";

// The profile source for the UI (replaces the hardcoded "Walt Burge" identity).
export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(u);
}
