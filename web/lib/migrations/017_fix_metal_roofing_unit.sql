-- Resolve the bogus "metal" unit on roofing lines.
--
-- The spreadsheets carry "per metal" in the unit column, which normalize.py reduces to the unit
-- "metal". That is a material, not a measure, so 28 roofing lines landed in one bucket regardless
-- of what they were actually priced per. The bucket then mixed two bases that differ by 100x and
-- produced a meaningless median: metal roofing labor read $46.50 before the dedup and $8.00
-- after, while the same work also sat in a "sqft" bucket at $4 and a "square" bucket at $175.
--
-- The two bases separate cleanly on quantity, with no overlap anywhere in the data:
--     qty >= 100  ->  310-3783 units at $2.00-$8.00     = priced per SQUARE FOOT
--     qty <  100  ->  9-86 units at $85.00-$200.00      = priced per SQUARE (100 sqft)
-- Those are consistent with each other: $2.00/sqft is $200/square, which is exactly what the
-- per-square lines say. Same trade, same money, two ways of writing it down.
--
-- This only relabels the basis; no price is altered and no line is merged across bases. Shingle
-- roofing is untouched — all 107 of its lines are already coherently per-square.
--
-- Scoped to roofing on purpose. "metal railings" also carries the bogus unit, but it is a single
-- line (never reaches the catalog, which needs >= 2) and railings are a linear-foot item, so it
-- is not the same correction.

UPDATE line_items
   SET norm_unit = CASE WHEN qty >= 100 THEN 'sqft' ELSE 'square' END
 WHERE norm_unit = 'metal'
   AND canon_desc LIKE 'metal roofing%'
   AND qty IS NOT NULL
   AND qty > 0;
