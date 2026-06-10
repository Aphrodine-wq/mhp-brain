import Link from "next/link";
import { crewList } from "@/lib/queries";
import { initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const crew = await crewList();
  return (
    <section className="view">
      <h2>Crew</h2>
      <div className="sub">The MHP team — roles and contacts from the personnel directory.</div>
      <div className="crew-grid">
        {crew.map((m) => (
          <Link key={m.key} href={`/crew/${encodeURIComponent(m.key)}`} className="crew-card" style={{ display: "block" }}>
            <div className="crew-top">
              <div className="crew-av">{initials(m.name)}</div>
              <div>
                <div className="cn">{m.name}</div>
                <div className="cr">{m.role}</div>
              </div>
            </div>
            <div className="crew-meta">
              {m.phone && <div>{m.phone}</div>}
              {m.email && <div>{m.email}</div>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
