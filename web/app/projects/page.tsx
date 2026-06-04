import { projectsList } from "@/lib/queries";
import ProjectsTable from "./ProjectsTable";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await projectsList();
  return (
    <section className="view">
      <h2>Projects</h2>
      <div className="sub">
        Status is inferred from each job&apos;s latest document — <b>Active</b> = 2026 activity,{" "}
        <b>Aging</b> = 2025, <b>Likely Done</b> = 2024 or older. Verify against what&apos;s actually on the board.
      </div>
      <ProjectsTable projects={projects} />
    </section>
  );
}
