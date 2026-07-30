-- Second half of the roofing unit correction (see 017).
--
-- Relabelling the bogus "metal" unit exposed two lines that were already wrong before it: the
-- source spreadsheet says "sqft" but the numbers are per SQUARE.
--
--     metal roofing labor      qty 6 @ $165.00 = $990   ("sqft")
--     metal roofing materials  qty 6 @ $135.00 = $810   ("Sqft")
--
-- Six square feet of roof does not cost $990. Six squares — 600 sqft — at $165 does, and $165
-- per square sits right in the middle of the per-square lines either side of it. The label is
-- the typo, not the money.
--
-- The rule needs both halves to be safe. A genuine per-sqft roofing line runs to hundreds or
-- thousands of units at $2-$8; requiring qty < 100 AND a price at or above $50 cannot catch one,
-- because no real per-sqft line is anywhere near that price. Scoped to metal roofing for the
-- same reason as 017 — this is a correction backed by specific evidence, not a general sweep.

UPDATE line_items
   SET norm_unit = 'square'
 WHERE canon_desc LIKE 'metal roofing%'
   AND norm_unit = 'sqft'
   AND qty IS NOT NULL
   AND qty > 0
   AND qty < 100
   AND unit_price >= 50;
