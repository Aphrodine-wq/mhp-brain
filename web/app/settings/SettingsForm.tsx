"use client";

import { useEffect, useState } from "react";

export default function SettingsForm() {
  const [markup, setMarkup] = useState(18);
  const [market, setMarket] = useState("Oxford");
  const [bands, setBands] = useState(true);
  const [cont, setCont] = useState(true);
  const [loaded, setLoaded] = useState(false);

  // Hydrate once from localStorage AFTER mount. This has to be an effect, not a lazy useState
  // initializer: this client component still SSRs with the defaults, so reading localStorage at
  // render time would hydrate-mismatch (server has no localStorage). The `loaded` guard on the
  // persist effect below keeps it from writing defaults back before this runs.
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration has no render-time equivalent under SSR */
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("mhp_settings") || "{}");
      if (s.markup) setMarkup(Number(s.markup));
      if (s.market) setMarket(s.market);
      if (s.bands === false) setBands(false);
      if (s.cont === false) setCont(false);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (loaded) localStorage.setItem("mhp_settings", JSON.stringify({ markup, market, bands, cont }));
  }, [loaded, markup, market, bands, cont]);

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Estimating defaults</h3>
      <div className="setrow">
        <div>
          <div className="sl">Default markup</div>
          <div className="sd">Applied to new estimates (MHP median is 18%).</div>
        </div>
        <div>
          <input type="number" value={markup} style={{ width: 80 }} onChange={(e) => setMarkup(Number(e.target.value))} /> %
        </div>
      </div>
      <div className="setrow">
        <div>
          <div className="sl">Default market</div>
          <div className="sd">Pre-selects the market on new jobs.</div>
        </div>
        <select value={market} onChange={(e) => setMarket(e.target.value)}>
          <option>Oxford</option>
          <option>Pickwick</option>
          <option>Corinth</option>
          <option>Tupelo</option>
        </select>
      </div>
      <div className="setrow">
        <div>
          <div className="sl">Show confidence bands</div>
          <div className="sd">Display the historical price band on each line.</div>
        </div>
        <div className={`toggle${bands ? " on" : ""}`} onClick={() => setBands((b) => !b)} />
      </div>
      <div className="setrow">
        <div>
          <div className="sl">Auto-suggest contingency</div>
          <div className="sd">Pad uncertain lines based on price spread.</div>
        </div>
        <div className={`toggle${cont ? " on" : ""}`} onClick={() => setCont((c) => !c)} />
      </div>
    </div>
  );
}
