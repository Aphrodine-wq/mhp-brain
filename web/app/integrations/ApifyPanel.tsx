import { Robot } from "@phosphor-icons/react/dist/ssr";

// Apify — the scraping backend for material-price feeds. The token lives in Vercel env
// (APIFY_TOKEN), set by an admin from the CLI — never entered on the site.
export default function ApifyPanel({ configured }: { configured: boolean }) {
  return (
    <div className="conn-card">
      <div className="conn-card-head">
        <div className="conn-icon" style={{ color: "var(--navy)" }}><Robot size={22} /></div>
        <div className="conn-title">
          <div className="sl">Apify</div>
          {configured ? <span className="badge active">Configured</span> : <span className="badge unknown">Not set up</span>}
        </div>
      </div>
      <div className="sd conn-desc">
        Scraping backend for material-price feeds.
        {configured ? " API key is set in the server environment." : " Set APIFY_TOKEN in the server environment to connect."}
      </div>
    </div>
  );
}
