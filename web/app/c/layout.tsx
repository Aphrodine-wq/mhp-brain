// Public client-portal shell — branded, read-only, no app chrome (the root layout renders children
// bare for unauthenticated visitors). Self-contained so nothing internal leaks in.
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 60px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 18, borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "var(--disp)" }}>M</div>
        <div>
          <div style={{ fontFamily: "var(--disp)", fontWeight: 650, fontSize: 16, color: "var(--ink)" }}>North Mississippi Home Pros</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Project status · MS Residential Builder R21909</div>
        </div>
      </header>
      {children}
      <footer style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--muted)" }}>
        Questions about your project? Reach out to North Mississippi Home Pros directly. This page is read-only.
      </footer>
    </div>
  );
}
