import { estimateRequestsList } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const requests = await estimateRequestsList();
  const fresh = requests.filter((r) => r.status === "new").length;

  return (
    <section className="view">
      <h2>Estimate Requests</h2>
      <div className="sub">
        Homeowner requests submitted from the website — the top of the funnel.{" "}
        <b>{fresh} new</b> · {requests.length} total. Open one and build the bid straight from their scope.
      </div>

      {requests.length === 0 ? (
        <p className="empty">No requests yet. They&apos;ll land here the moment someone submits the form on the site.</p>
      ) : (
        <table className="dtable">
          <thead>
            <tr>
              <th>When</th><th>Name</th><th>Contact</th><th>Project</th>
              <th>Sq ft</th><th>Scope</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const params = new URLSearchParams();
              if (r.scope) params.set("scope", r.scope);
              if (r.sqft) params.set("sqft", String(r.sqft));
              if (r.name) params.set("client", r.name);
              return (
                <tr key={r.id}>
                  <td>{r.createdAt.slice(0, 10)}</td>
                  <td>
                    <b>{r.name}</b>
                    {r.address ? <div><small>{r.address}</small></div> : null}
                  </td>
                  <td>
                    {r.phone ? <div><a href={`tel:${r.phone}`}>{r.phone}</a></div> : null}
                    {r.email ? <div><a href={`mailto:${r.email}`}>{r.email}</a></div> : null}
                  </td>
                  <td>{r.projectType || "—"}{r.market ? <div><small>{r.market}</small></div> : null}</td>
                  <td>{r.sqft ? r.sqft.toLocaleString() : "—"}</td>
                  <td className="scope">{r.scope || "—"}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>
                    <Link href={`/estimate-builder?${params.toString()}`} className="btn ghost sm">
                      Build estimate
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
