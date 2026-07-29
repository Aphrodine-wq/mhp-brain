import Link from "next/link";
import { crewList } from "@/lib/queries";
import { initials } from "@/lib/format";
import { crewPhoto } from "./photos";

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const crew = await crewList();
  return (
    <section className="view">
      <h2>Crew</h2>
      <div className="crew-grid">
        {crew.map((m) => {
          const photo = crewPhoto(m.name);
          return (
            <Link key={m.key} href={`/crew/${encodeURIComponent(m.key)}`} className="crew-card" style={{ display: "block" }}>
              <div className="crew-top">
                <div className="crew-av">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt={m.name} /> : initials(m.name)}
                </div>
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
          );
        })}
      </div>
    </section>
  );
}
