-- Outbound links to where a job also lives: its Trello board and its QuickBooks customer.
--
-- Deliberately plain URLs rather than ids. Trello boards here are per-project ("Michael Mason
-- Project", "North MS Animal Hospital") with no naming rule that maps cleanly to a project slug,
-- and QuickBooks isn't connected yet (no qb oauth row, no qb_job_costs table). A URL is the one
-- thing that works today and keeps working after either integration lands — resolve to ids later
-- if the API ever needs them.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS trello_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quickbooks_url TEXT;
