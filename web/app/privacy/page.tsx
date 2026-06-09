import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MHP Estimate",
  description: "How the MHP Estimate app collects, uses, and protects data.",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px 96px",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  color: "#111",
  lineHeight: 1.6,
};

export default function PrivacyPolicy() {
  return (
    <main style={containerStyle}>
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Last updated: June 9, 2026</p>

      <p>
        This Privacy Policy explains how Walt Builds (&ldquo;we,&rdquo; &ldquo;us&rdquo;) collects,
        uses, and protects information in connection with the MHP Estimate application
        (the &ldquo;App&rdquo;), a job-costing and estimating tool operated for MHP Construction
        (North Mississippi Home Professionals). By connecting your accounts to the App, you agree
        to the practices described here.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>Information we access</h2>
      <p>When you connect QuickBooks Online to the App, we access the following on a read-only basis:</p>
      <ul>
        <li>Company information (company name, identifiers, and accounting preferences).</li>
        <li>Customers, jobs, vendors, bills, invoices, payments, and related accounting transactions.</li>
        <li>Account and authentication details needed to maintain the connection (OAuth tokens).</li>
      </ul>
      <p>
        We request the <code>com.intuit.quickbooks.accounting</code> scope only. The App is
        <strong> read-only</strong> &mdash; it never creates, edits, or deletes anything in your
        QuickBooks company.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>How we use information</h2>
      <ul>
        <li>To compute per-job profit and loss, margins, and cost actuals for MHP Construction.</li>
        <li>To match expenses and revenue to the correct jobs and produce internal estimating and reporting.</li>
        <li>To maintain and secure the connection between the App and your QuickBooks company.</li>
      </ul>
      <p>
        We do not use your QuickBooks data for advertising, and we do not sell it. We do not share
        it with third parties except service providers strictly necessary to operate the App, or
        where required by law.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>Intuit and QuickBooks</h2>
      <p>
        Access to QuickBooks data is provided through Intuit&rsquo;s API under their authorization.
        Your use of QuickBooks remains subject to Intuit&rsquo;s own terms and privacy policy. You
        can review or revoke the App&rsquo;s access at any time from within your Intuit account
        (Apps &rarr; Connected apps), or from the App&rsquo;s Integrations page.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>Storage and security</h2>
      <ul>
        <li>OAuth tokens are encrypted at rest and are never stored in plaintext.</li>
        <li>Access is limited to the read-only accounting scope described above.</li>
        <li>Accounting data retrieved for reporting is stored only as needed to produce job-cost analysis for MHP Construction.</li>
      </ul>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>Retention and deletion</h2>
      <p>
        Disconnecting QuickBooks from the App&rsquo;s Integrations page revokes the stored tokens
        and stops further access. To request deletion of data already retrieved, contact us using
        the details below and we will delete it unless we are required to retain it by law.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>Your choices</h2>
      <p>
        You may revoke the App&rsquo;s access to QuickBooks at any time through Intuit or the
        Integrations page. Revoking access does not affect data already lawfully processed before
        revocation.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>Contact</h2>
      <p>
        Questions about this policy or requests regarding your data:
        <br />
        Walt Builds &mdash; <a href="mailto:jamesburge.mcm@gmail.com">jamesburge.mcm@gmail.com</a>
      </p>
    </main>
  );
}
