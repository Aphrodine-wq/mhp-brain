import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "End-User License Agreement — MHP Estimate",
  description: "Terms governing use of the MHP Estimate application.",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px 96px",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  color: "#111",
  lineHeight: 1.6,
};

export default function Eula() {
  return (
    <main style={containerStyle}>
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>End-User License Agreement</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Last updated: June 9, 2026</p>

      <p>
        This End-User License Agreement (&ldquo;Agreement&rdquo;) is a legal agreement between you
        and Walt Builds (&ldquo;we,&rdquo; &ldquo;us&rdquo;) governing your use of the MHP Estimate
        application (the &ldquo;App&rdquo;), a job-costing and estimating tool operated for MHP
        Construction (North Mississippi Home Professionals). By accessing or using the App, you
        accept this Agreement. If you do not agree, do not use the App.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>1. License</h2>
      <p>
        We grant you a limited, non-exclusive, non-transferable, revocable license to access and
        use the App for its intended purpose: managing estimates, jobs, and job-cost reporting for
        MHP Construction. All rights not expressly granted are reserved.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>2. QuickBooks connection</h2>
      <p>
        The App can connect to QuickBooks Online using Intuit&rsquo;s authorization, on a
        <strong> read-only</strong> basis, to retrieve accounting data for job-cost and
        profit-and-loss reporting. The App does not create, modify, or delete data in your
        QuickBooks company. Your use of QuickBooks remains governed by Intuit&rsquo;s terms. You may
        revoke the connection at any time.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Reverse engineer, decompile, or attempt to extract source code except as permitted by law.</li>
        <li>Use the App to access data you are not authorized to access.</li>
        <li>Interfere with or disrupt the integrity or performance of the App.</li>
        <li>Resell, sublicense, or commercially exploit the App without our written consent.</li>
      </ul>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>4. Data</h2>
      <p>
        Our handling of data accessed through the App is described in our{" "}
        <a href="/privacy">Privacy Policy</a>, which is incorporated into this Agreement by reference.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>5. Disclaimer of warranties</h2>
      <p>
        The App is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
        of any kind, whether express or implied, including fitness for a particular purpose and
        non-infringement. We do not warrant that the App will be uninterrupted, error-free, or that
        any figures it produces are free of error. You are responsible for verifying financial
        figures against source records.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>6. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we will not be liable for any indirect, incidental,
        special, consequential, or punitive damages, or for lost profits or data, arising out of or
        related to your use of the App.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>7. Termination</h2>
      <p>
        This license remains in effect until terminated. We may suspend or terminate access at any
        time for any reason. Upon termination, your right to use the App ceases. Sections that by
        their nature should survive termination will survive.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>8. Governing law</h2>
      <p>
        This Agreement is governed by the laws of the State of Mississippi, without regard to its
        conflict-of-laws rules.
      </p>

      <h2 style={{ fontSize: 22, marginTop: 32 }}>9. Contact</h2>
      <p>
        Walt Builds &mdash; <a href="mailto:jamesburge.mcm@gmail.com">jamesburge.mcm@gmail.com</a>
      </p>
    </main>
  );
}
