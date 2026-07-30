import Link from "next/link";
import { Phone, EnvelopeSimple, SealCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { crewList, type CrewRow } from "@/lib/queries";
import { initials } from "@/lib/format";
import { crewPhoto } from "./photos";

export const dynamic = "force-dynamic";

// Several roles carry a credential inside the same string — "Sr. Superintendent · Licensed
// Contractor R21909". Split it so the licence reads as a credential rather than as more job
// title, which is how it renders today: one long unbroken line.
function splitRole(role: string): { title: string; credential: string | null } {
  const parts = role.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { title: role, credential: null };
  const credential = parts.find((p) => /licen[sc]|certif|osha|r\d{3,}/i.test(p)) ?? null;
  const title = parts.filter((p) => p !== credential).join(" · ");
  return { title: title || role, credential };
}

// What the office still has to collect. Every one of these is editable on the member's own page,
// so the count is a to-do rather than a complaint — today only one of seven has a rate on file
// and none have a hire date or emergency contact.
const PROFILE_FIELDS: { key: keyof CrewRow; label: string }[] = [
  { key: "phone", label: "phone" },
  { key: "email", label: "email" },
  { key: "rate", label: "rate" },
  { key: "hireDate", label: "hire date" },
  { key: "emergencyContact", label: "emergency contact" },
  { key: "certifications", label: "certifications" },
];

function missingFields(m: CrewRow): string[] {
  return PROFILE_FIELDS.filter(({ key }) => {
    const v = m[key];
    return v == null || String(v).trim() === "";
  }).map((f) => f.label);
}

export default async function CrewPage() {
  const crew = await crewList();
  const incomplete = crew.filter((m) => missingFields(m).length > 0).length;

  return (
    <section className="view">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Crew</h2>
        <div className="sub">
          {crew.length} {crew.length === 1 ? "person" : "people"}
          {incomplete > 0 && ` · ${incomplete} with details still to collect`}
        </div>
      </div>

      <div className="crew-grid" style={{ marginTop: 14 }}>
        {crew.map((m) => {
          const photo = crewPhoto(m.name);
          const { title, credential } = splitRole(m.role);
          const missing = missingFields(m);
          const phoneHref = m.phone ? `tel:${m.phone.replace(/[^\d+]/g, "")}` : null;

          return (
            <div key={m.key} className="crew-card">
              <Link href={`/crew/${encodeURIComponent(m.key)}`} className="crew-open">
                <div className="crew-top">
                  <div className="crew-av">
                    {/* alt is empty on purpose: the name sits right beside it, so a screen reader
                        (or a copy-paste) would otherwise say the name twice. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photo ? <img src={photo} alt="" /> : initials(m.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cn">{m.name}</div>
                    <div className="cr">{title}</div>
                  </div>
                </div>

                {credential && (
                  <div className="crew-cred">
                    <SealCheck size={12} weight="fill" />
                    {credential}
                  </div>
                )}
              </Link>

              {/* Outside the Link on purpose — a tel:/mailto: anchor cannot nest inside another
                  anchor, and one tap to call is the whole point on a phone in the field. */}
              <div className="crew-contact">
                {phoneHref ? (
                  <a className="crew-line" href={phoneHref}>
                    <Phone size={12} weight="fill" />
                    {m.phone}
                  </a>
                ) : (
                  <span className="crew-line off"><Phone size={12} />no phone</span>
                )}
                {m.email ? (
                  <a className="crew-line" href={`mailto:${m.email}`}>
                    <EnvelopeSimple size={12} weight="fill" />
                    {m.email}
                  </a>
                ) : (
                  <span className="crew-line off"><EnvelopeSimple size={12} />no email</span>
                )}
              </div>

              <div className="crew-foot">
                {m.rate ? <span className="crew-rate">{m.rate}</span> : <span />}
                {missing.length > 0 && (
                  <Link
                    href={`/crew/${encodeURIComponent(m.key)}`}
                    className="crew-missing"
                    title={`Still to collect: ${missing.join(", ")}`}
                  >
                    <WarningCircle size={12} />
                    {missing.length} to add
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
