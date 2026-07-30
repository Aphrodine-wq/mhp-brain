-- Banker's rounding, in SQL — a faithful twin of pyRound() in lib/queries.ts.
--
-- Python's round() is round-half-to-even; Postgres' round() is round-half-away-from-zero. The
-- catalog (unit_costs/lump_costs) was originally built by normalize.py, so every stored price
-- carries Python's convention. Rebuilding those tables in Postgres with plain round() drifts a
-- cent on exact .5 ties — 7 of 279 entries drifted on the first attempt.
--
-- This handles the genuine tie case: 9.125 -> 9.12, not 9.13. That takes the rebuilt catalog from
-- 7 disagreements with the Python-built one down to 2 (of 279).
--
-- KNOWN LIMIT — the last 2 are not fixable in SQL. Python's round() inspects the true binary
-- value: 3.635 is really 3.63499999999999978, so it rounds DOWN to 3.63. Postgres cannot see
-- that; float8 -> numeric yields the shortest round-trip form (exactly 3.635), and 3.635 * 100 is
-- exactly 363.5 in both languages, so the "below the tie" information is already gone before any
-- rounding happens. Those two entries ("porch material", "siding labor") land a cent above what
-- normalize.py produced. A cent on a per-unit rate is immaterial to a bid, and Postgres is the
-- source of truth for the catalog now — but if the Python pipeline is ever re-run, expect those
-- two to flip back by $0.01 rather than assuming something broke.
--
-- Prices in the catalog are always > 0 (both call sites filter on it), so the negative branch is
-- there for correctness rather than because it is exercised.
CREATE OR REPLACE FUNCTION py_round2(x double precision) RETURNS numeric AS $$
DECLARE
  cents double precision;
  fl    double precision;
  frac  double precision;
  whole numeric;
BEGIN
  IF x IS NULL THEN RETURN NULL; END IF;
  cents := x * 100;
  fl    := floor(cents);
  frac  := cents - fl;
  IF frac < 0.5 THEN
    whole := fl::numeric;
  ELSIF frac > 0.5 THEN
    whole := fl::numeric + 1;
  ELSE
    -- exact tie: keep the even cent
    whole := CASE WHEN (fl::bigint % 2) = 0 THEN fl::numeric ELSE fl::numeric + 1 END;
  END IF;
  RETURN whole / 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
