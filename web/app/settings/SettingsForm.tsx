"use client";

import { useEffect, useState } from "react";

export default function SettingsForm() {
  const [markup, setMarkup] = useState(18);
  const [contPct, setContPct] = useState(10);
  const [taxPct, setTaxPct] = useState(7);
  const [market, setMarket] = useState("Oxford");
  const [preparedBy, setPreparedBy] = useState("MHP Construction");
  const [bands, setBands] = useState(true);
  const [cont, setCont] = useState(true);
  const [packetDetail, setPacketDetail] = useState(false);
  const [compact, setCompact] = useState(false);
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
      if (s.contPct != null) setContPct(Number(s.contPct));
      if (s.taxPct != null) setTaxPct(Number(s.taxPct));
      if (s.market) setMarket(s.market);
      if (s.preparedBy) setPreparedBy(s.preparedBy);
      if (s.bands === false) setBands(false);
      if (s.cont === false) setCont(false);
      if (s.packetDetail === true) setPacketDetail(true);
      if (s.compact === true) setCompact(true);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      "mhp_settings",
      JSON.stringify({ markup, contPct, taxPct, market, preparedBy, bands, cont, packetDetail, compact }),
    );
    document.body.classList.toggle("compact", compact); // applies instantly; layout re-applies on load
  }, [loaded, markup, contPct, taxPct, market, preparedBy, bands, cont, packetDetail, compact]);

  return (
    <>
      <details className="panel settings-fold" style={{ marginTop: 18 }}>
        <summary>Estimating defaults</summary>
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
            <div className="sl">Contingency</div>
            <div className="sd">Buffer shown in the live preview on new estimates.</div>
          </div>
          <div>
            <input type="number" value={contPct} style={{ width: 80 }} onChange={(e) => setContPct(Number(e.target.value))} /> %
          </div>
        </div>
        <div className="setrow">
          <div>
            <div className="sl">Sales tax</div>
            <div className="sd">Applied on the client packet total (MS state rate is 7%).</div>
          </div>
          <div>
            <input type="number" value={taxPct} style={{ width: 80 }} onChange={(e) => setTaxPct(Number(e.target.value))} /> %
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
            <div className="sl">Prepared by</div>
            <div className="sd">Pre-fills the &quot;prepared by&quot; line on new estimates and client packets.</div>
          </div>
          <input value={preparedBy} style={{ width: 220 }} onChange={(e) => setPreparedBy(e.target.value)} />
        </div>
      </details>

      <details className="panel settings-fold" style={{ marginTop: 18 }}>
        <summary>Estimator display</summary>
        <div className="setrow">
          <div>
            <div className="sl">Show price history</div>
            <div className="sd">Historical rate range and job count under each line&apos;s rate.</div>
          </div>
          <div className={`toggle${bands ? " on" : ""}`} onClick={() => setBands((b) => !b)} />
        </div>
        <div className="setrow">
          <div>
            <div className="sl">Include contingency</div>
            <div className="sd">Show the contingency buffer in the live preview rollup.</div>
          </div>
          <div className={`toggle${cont ? " on" : ""}`} onClick={() => setCont((c) => !c)} />
        </div>
        <div className="setrow">
          <div>
            <div className="sl">Packet line detail</div>
            <div className="sd">Client packet opens with per-line detail shown under each division.</div>
          </div>
          <div className={`toggle${packetDetail ? " on" : ""}`} onClick={() => setPacketDetail((v) => !v)} />
        </div>
      </details>
    </>
  );
}
