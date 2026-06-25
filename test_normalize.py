"""Catalog normalization — proof the classifier and quantiles are correct.

The unit-cost catalog IS the product; it's built from these pure functions. classify() decides
whether a line teaches a per-unit rate, a lump sum, or nothing; quantile() builds the p25/p75
confidence band; canon_division() standardizes labels without re-taxonomizing.

Run:  python3 test_normalize.py
"""
import normalize as n


def test_classify():
    # A real per-unit line: qty*price == total, qty != 1.
    assert n.classify(100, 8.0, 800) == "UNIT_RATE"
    # Lump: qty==1 and unit_price == item_total.
    assert n.classify(1, 38500, 38500) == "LUMP_SUM"
    # Lump via the no-/zero-qty branch.
    assert n.classify(0, 2350, 2350) == "LUMP_SUM"
    assert n.classify(None, 2350, 2350) == "LUMP_SUM"
    # No total → can't price → IRREGULAR.
    assert n.classify(2, 10, 0) == "IRREGULAR"
    # qty*price nowhere near total → IRREGULAR.
    assert n.classify(2, 10, 999) == "IRREGULAR"
    # Within the ±3% tolerance still counts as a unit rate.
    assert n.classify(100, 8.0, 810) == "UNIT_RATE"  # ratio 0.988
    print("  [ok] classify — UNIT_RATE / LUMP_SUM / IRREGULAR + tolerance")


def test_quantile():
    vals = [10, 20, 30, 40]
    assert n.quantile(vals, 0.5) == 25.0           # interpolated median
    assert n.quantile(vals, 0.25) == 17.5          # interpolated p25
    assert n.quantile([42], 0.5) == 42             # single value → itself
    assert n.quantile([30, 10, 20], 0.0) == 10     # sorts first
    print("  [ok] quantile — interpolated p25/median, single-value, sorts input")


def test_canon_and_division():
    assert n.canon("  Framing   LABOR ") == "framing labor"
    assert n.canon(None) == ""
    assert n.canon_division("division 1:  Sitework") == "Division 1: Sitework"
    assert n.canon_division("Division 10 :  Metal") == "Division 10: Metal"
    # A name MHP chose is preserved exactly (only whitespace/format normalized).
    assert n.canon_division("Division 8: (Doors & Windows)") == "Division 8: (Doors & Windows)"
    # Non-division header: whitespace collapsed, otherwise untouched.
    assert n.canon_division("  Random   Header ") == "Random Header"
    assert n.canon_division(None) is None
    print("  [ok] canon + canon_division — label cleanup, names preserved")


def test_subtotal_and_units():
    assert n.is_subtotal("Subtotal") is True
    assert n.is_subtotal("Grand Total") is True
    assert n.is_subtotal("Framing Labor") is False

    assert n.norm_unit("per door") == "door"          # strips "per "
    assert n.norm_unit("SQFT/allowance") == "sqft"     # strips the allowance flag, lowercases
    assert n.norm_unit(None) is None

    # resolve_unit reads the description to disambiguate scope-words used as units.
    assert n.resolve_unit("interior door", "interior") == "each"
    assert n.resolve_unit("interior paint", "interior") == "sqft"
    assert n.resolve_unit("carpet", "yard") == "sqyd"
    assert n.resolve_unit("concrete footing", "yard") == "cy"
    print("  [ok] is_subtotal, norm_unit, resolve_unit (item-aware)")


if __name__ == "__main__":
    print("\nNormalization proof")
    print("=" * 70)
    test_classify()
    test_quantile()
    test_canon_and_division()
    test_subtotal_and_units()
    print("=" * 70)
    print("PASS — classifier, quantiles, division labels, and unit resolution all correct.")
    print("=" * 70)
