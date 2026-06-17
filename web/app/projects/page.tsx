import { projectsList } from "@/lib/queries";
import ProjectsTable from "./ProjectsTable";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await projectsList();
  return (
    <section className="view">
      <h2>Projects</h2>
      <ProjectsTable projects={projects} />
    </section>
  );
}
