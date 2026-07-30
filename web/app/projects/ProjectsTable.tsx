"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CookingPot, Bathtub, Tree, House, Warehouse, HouseLine, Hammer, Wall, Waves,
  PaintRoller, SquaresFour, Buildings, Storefront, Question, Folder, Package,
} from "@phosphor-icons/react";
import type { ProjectRow } from "@/lib/queries";
import { money, BADGE } from "@/lib/format";
import { post } from "@/lib/client";

const STATUSES = ["Active", "Aging", "Bid", "Paused", "Complete", "Likely Done", "Dead", "Unknown"];

// Type keywords → group label + door icon. Used two ways: to icon the real type groups,
// and to infer a group from the project NAME when the import left type blank/"Unclassified".
const TYPE_RULES: [RegExp, string, React.ReactNode][] = [
  [/kitchen/i, "Kitchen", <CookingPot size={18} />],
  [/bath|shower/i, "Bathroom", <Bathtub size={18} />],
  [/porch|deck|patio/i, "Porch & Deck", <Tree size={18} />],
  [/roof/i, "Roofing", <House size={18} />],
  [/garage|barn|barndo|shop/i, "Garage & Barn", <Warehouse size={18} />],
  [/addition/i, "Addition", <HouseLine size={18} />],
  [/reno|remodel/i, "Renovation", <Hammer size={18} />],
  [/fence/i, "Fence", <Wall size={18} />],
  [/pool/i, "Pool", <Waves size={18} />],
  [/paint/i, "Painting", <PaintRoller size={18} />],
  [/floor/i, "Flooring", <SquaresFour size={18} />],
  [/new build|new construction|custom home|build project/i, "New Build", <Buildings size={18} />],
  [/clinic|office|commercial|tenant/i, "Commercial", <Storefront size={18} />],
  [/inquiry|lead/i, "Inquiries", <Question size={18} />],
];

function iconFor(label: string): React.ReactNode {
  return TYPE_RULES.find(([re]) => re.test(label))?.[2] ?? <Folder size={18} />;
}

// Grouping key: the job's real type when it has one ("Kitchen Remodel; Bathroom" → first
// segment). When the import left it blank or literally "Unclassified", infer from the name —
// "Chance Grilling Porch Project" groups under Porch & Deck. Truly unknowable stays Unclassified.
function groupKey(p: ProjectRow): string {
  const t = (p.type || "").split(";")[0].trim();
  if (t && t !== "Unclassified") return t;
  return TYPE_RULES.find(([re]) => re.test(p.name))?.[1] ?? "Unclassified";
}

export default function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  async function setStatus(p: ProjectRow, status: string) {
    if (status === p.status) return;
    setBusy(p.id);
    try {
      await post("/api/override/status", { id: p.id, status, name: p.name });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const byType = new Map<string, ProjectRow[]>();
  for (const p of projects) {
    const t = groupKey(p);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(p);
  }
  // biggest groups first; unclassified catch-alls always last
  const tail = (t: string) => (t === "Other" || t === "Unclassified" ? 1 : 0);
  const groups = [...byType.entries()].sort((a, b) =>
    tail(a[0]) - tail(b[0]) || b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  // door cards first, like Pricing — drill into one type (or All) at a time
  if (!openGroup) {
    return (
      <div className="type-grid" style={{ marginTop: 22 }}>
        <button className="type-card" onClick={() => setOpenGroup("__all__")}>
          <span className="type-icon"><Package size={18} /></span>
          <span>All projects</span>
          <span className="type-sub">{projects.length} total</span>
        </button>
        {groups.map(([type, rows]) => (
          <button key={type} className="type-card" onClick={() => setOpenGroup(type)}>
            <span className="type-icon">{iconFor(type)}</span>
            <span>{type}</span>
            <span className="type-sub">{rows.length} project{rows.length === 1 ? "" : "s"}</span>
          </button>
        ))}
      </div>
    );
  }

  const rows = openGroup === "__all__" ? projects : (byType.get(openGroup) ?? []);
  return (
    <div style={{ marginTop: 18 }}>
      <button className="btn ghost sm" onClick={() => setOpenGroup(null)}>← All types</button>
      <h3 style={{ margin: "14px 0 4px", fontFamily: "var(--disp)", fontSize: 20 }}>
        {openGroup === "__all__" ? "All projects" : openGroup}
      </h3>
      <table className="dtable">
        <thead>
          <tr>
            <th>Project</th><th>Market</th><th>Status</th><th>Last activity</th>
            <th className="n">Est. Value</th><th className="n">Bids</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/projects/${p.id}`} className="cell-link">{p.name}</Link></td>
                <td>{p.market || "—"}</td>
                <td>
                  <select
                    className={`badge ${BADGE[p.status] || "unknown"}`}
                    value={p.status}
                    disabled={busy === p.id}
                    onChange={(e) => setStatus(p, e.target.value)}
                    style={{ border: 0, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}
                    title="Change status — saved as a correction"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>{p.last || "—"}</td>
                <td className="n">{p.value ? money(p.value) : "—"}</td>
                <td className="n">{p.estimates}</td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
