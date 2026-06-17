import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { estimateDocsList } from "@/lib/queries";
import { listDocuments, DOC_CATEGORIES, type DocMeta } from "@/lib/documents-store";
import CollapseSection from "../_components/CollapseSection";
import DocsUpload from "./DocsUpload";

export const dynamic = "force-dynamic";

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function DocumentsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [docs, estDocs] = await Promise.all([listDocuments(), estimateDocsList()]);

  const byCat = new Map<string, DocMeta[]>();
  for (const d of docs) {
    if (!byCat.has(d.category)) byCat.set(d.category, []);
    byCat.get(d.category)!.push(d);
  }

  return (
    <section className="view">
      <h2>Documents</h2>

      <div className="row" style={{ marginTop: 0 }}>
        <DocsUpload />
      </div>

      {DOC_CATEGORIES.map((cat) => {
        const rows = byCat.get(cat) ?? [];
        return (
          <CollapseSection key={cat} title={cat} summary={`${rows.length} document${rows.length === 1 ? "" : "s"}`}>
            <table className="dtable">
              <thead>
                <tr><th>Document</th><th>Linked to</th><th className="n">Size</th><th>Date</th><th>By</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty" style={{ padding: "28px 20px" }}>Nothing in {cat} yet.</div></td></tr>
                ) : (
                  rows.map((d) => (
                    <tr key={d.id}>
                      <td><a href={`/api/documents/${d.id}`} className="cell-link">{d.filename} ↓</a></td>
                      <td>
                        {d.entityType === "sub" && d.entityId ? (
                          <Link href={`/subs/${encodeURIComponent(d.entityId)}`} className="cell-link">{d.entityLabel || d.entityId}</Link>
                        ) : d.entityType === "project" && d.entityId ? (
                          <Link href={`/projects/${d.entityId}`} className="cell-link">{d.entityLabel || d.entityId}</Link>
                        ) : (
                          d.entityLabel || "—"
                        )}
                      </td>
                      <td className="n">{fmtSize(d.sizeBytes)}</td>
                      <td>{d.uploadedAt || "—"}</td>
                      <td><small className="j">{d.uploadedBy || "—"}</small></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CollapseSection>
        );
      })}

      <CollapseSection title="Estimates" summary={`${estDocs.length} original${estDocs.length === 1 ? "" : "s"}`}>
        <table className="dtable">
          <thead>
            <tr><th>Document</th><th>Project</th><th>Date</th></tr>
          </thead>
          <tbody>
            {estDocs.map((d) => (
              <tr key={d.estimateId}>
                <td><a href={`/api/estimates/${d.estimateId}/document`} className="cell-link">{d.filename} ↓</a></td>
                <td><Link href={`/estimates/${d.estimateId}`} className="cell-link">{d.project}</Link></td>
                <td>{d.uploadedAt || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CollapseSection>
    </section>
  );
}
