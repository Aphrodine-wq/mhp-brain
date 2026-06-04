// Foundational de-risk: confirm libSQL reads the existing mhp.db and the tables/counts are what we expect.
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:/Users/jameswalton/Projects/mhp-brain/mhp.db" });

const one = async (sql) => (await db.execute(sql)).rows[0];

console.log("projects:   ", (await one("SELECT COUNT(*) n FROM projects")).n);
console.log("estimates:  ", (await one("SELECT COUNT(*) n FROM estimates")).n);
console.log("line_items: ", (await one("SELECT COUNT(*) n FROM line_items")).n);
console.log("unit_costs: ", (await one("SELECT COUNT(*) n FROM unit_costs")).n);
console.log("lump_costs: ", (await one("SELECT COUNT(*) n FROM lump_costs")).n);
console.log("subs:       ", (await one("SELECT COUNT(*) n FROM subs")).n);
console.log("crew:       ", (await one("SELECT COUNT(*) n FROM crew")).n);

const byStatus = await db.execute("SELECT status, COUNT(*) n FROM projects GROUP BY status ORDER BY n DESC");
console.log("by status:  ", byStatus.rows.map((r) => `${r.status}=${r.n}`).join("  "));

// Spot-check a real catalog row (the famous framing-labor median).
const fram = await db.execute(
  "SELECT canon_desc, unit, n_jobs, median_unit_price FROM unit_costs WHERE canon_desc LIKE '%framing labor%' LIMIT 3",
);
console.log("framing:    ", fram.rows);
