// Job Health — the per-job money rollup that turns separate integrations into one
// picture. It joins, per job: signed/estimated value, UNBILLED approved change
// orders (money earned, not yet invoiced), deposit status, and actual labor hours.
// The Money Radar ranks jobs by dollars bleeding, worst-first.
//
// Every source already matches to a project_id elsewhere in the app; this is the
// layer that aggregates them. Read-only. Defensive: a source table that doesn't
// exist yet (time_entries before its migration, change_orders on a fresh db) just
// contributes zero — the rollup never throws.
import { db } from "@/lib/db";
import { margin } from "@/lib/queries";

export interface JobHealth {
  id: string;
  name: string;
  status: string;
  contract_value: number | null; // projects.contract_value, else latest estimate SOV
  unbilled_co: number; // approved change orders not yet billed ($)
  deposit_amount: number | null;
  deposit_missing: boolean; // has a contract value but no deposit recorded
  actual_labor_hours: number;
  bleeding: number; // hard uncollected $: unbilled change orders
  flags: string[]; // human-readable leak callouts
}

export interface MoneyRadar {
  total_unbilled_co: number;
  jobs_missing_deposit: number;
  total_recoverable_margin: number; // from the existing margin() leak analysis
  jobs: JobHealth[]; // worst-first by bleeding
}

// A leak only counts on jobs that are live money — active work and signed bids.
const LIVE_STATUSES = ["Active", "Aging", "Bid", "Paused"];

async function sumByProject(sql: string): Promise<Map<string, number>> {
  // Returns project_id -> number. Empty map if the table isn't there yet.
  try {
    const rows = (await db.execute(sql)).rows;
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r.project_id), Number(r.v ?? 0));
    return m;
  } catch {
    return new Map();
  }
}

export async function jobHealth(): Promise<JobHealth[]> {
  const projects = (
    await db.execute({
      sql: `SELECT id, name, status, contract_value, deposit_amount
            FROM projects WHERE status = ANY(?)`,
      args: [LIVE_STATUSES],
    })
  ).rows;

  const [unbilled, hours, estSov] = await Promise.all([
    // Approved (1) but not billed (0) change orders — money earned, not invoiced.
    sumByProject(
      `SELECT project_id, COALESCE(SUM(amount),0) AS v
       FROM change_orders WHERE approved = 1 AND billed = 0 GROUP BY project_id`,
    ),
    sumByProject(
      `SELECT project_id, COALESCE(SUM(hours),0) AS v
       FROM time_entries GROUP BY project_id`,
    ),
    // Fallback contract basis when contract_value isn't set: the largest estimate SOV.
    sumByProject(
      `SELECT project_id, COALESCE(MAX(sum_sov_total),0) AS v
       FROM estimates WHERE sum_sov_total > 0 GROUP BY project_id`,
    ),
  ]);

  const out: JobHealth[] = projects.map((p) => {
    const id = String(p.id);
    const contractRaw = p.contract_value == null ? null : Number(p.contract_value);
    const contract_value = contractRaw && contractRaw > 0 ? contractRaw : (estSov.get(id) || null);
    const unbilled_co = Math.round((unbilled.get(id) ?? 0) * 100) / 100;
    const deposit_amount = p.deposit_amount == null ? null : Number(p.deposit_amount);
    const deposit_missing = Boolean(contract_value && contract_value > 0 && !(deposit_amount && deposit_amount > 0));
    const actual_labor_hours = Math.round((hours.get(id) ?? 0) * 10) / 10;

    const flags: string[] = [];
    if (unbilled_co > 0) flags.push(`$${unbilled_co.toLocaleString()} in unbilled change orders`);
    if (deposit_missing) flags.push(`No deposit recorded on a $${(contract_value ?? 0).toLocaleString()} job`);

    return {
      id,
      name: String(p.name),
      status: String(p.status),
      contract_value,
      unbilled_co,
      deposit_amount,
      deposit_missing,
      actual_labor_hours,
      bleeding: unbilled_co, // the hard, collectable number
      flags,
    };
  });

  return out;
}

export async function moneyRadar(): Promise<MoneyRadar> {
  const jobs = await jobHealth();
  jobs.sort((a, b) => b.bleeding - a.bleeding || Number(b.deposit_missing) - Number(a.deposit_missing));

  const total_unbilled_co = Math.round(jobs.reduce((s, j) => s + j.unbilled_co, 0) * 100) / 100;
  const jobs_missing_deposit = jobs.filter((j) => j.deposit_missing).length;

  let total_recoverable_margin = 0;
  try {
    total_recoverable_margin = Math.round((await margin()).recoverable);
  } catch {
    total_recoverable_margin = 0;
  }

  return { total_unbilled_co, jobs_missing_deposit, total_recoverable_margin, jobs };
}
