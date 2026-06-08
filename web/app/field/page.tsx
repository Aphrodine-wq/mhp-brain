import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import FieldForm from "./FieldForm";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Load active projects for the picker (only active + in-progress)
  const projects = (
    await db.execute(`
      SELECT id, name FROM projects
      WHERE status IN ('Active', 'active', 'Aging')
      ORDER BY name
    `)
  ).rows.map((r) => ({ id: String(r.id), name: String(r.name) }));

  return <FieldForm user={{ name: user.name, role: user.role }} projects={projects} />;
}
