"""QB→project matcher — proof the confidence tiers are correct.

A wrong match attaches the wrong job's costs and fabricates a P&L, so the tiering (exact /
high / medium / low / none) and the surname + address boosts are load-bearing. Pure functions,
no DB.

Run:  python3 test_qb_match.py
"""
import qb_match as m


def test_helpers():
    assert m.slug("Jooste Project!") == "jooste-project"
    assert m.slug("  A/B & C  ") == "a-b-c"
    assert m.name_words("Johnson Bathroom Reno") == ["johnson", "bathroom", "reno"]
    assert "big" not in m.name_words("Big Oak Deck"), "words under 4 chars are dropped"
    assert m.similarity("jooste project", "jooste project") == 1.0
    print("  [ok] helpers — slug, name_words (4+ chars), similarity")


def proj(pid, name, address_slug=""):
    return {"id": pid, "name": name, "address_slug": address_slug}


def test_exact_and_high():
    projects = [proj("jooste", "Jooste Project")]
    pid, conf, _ = m.match_job_to_project("Jooste Project", "", projects)
    assert (pid, conf) == ("jooste", "exact"), "identical slug → exact"

    # word overlap + surname boost, but not a slug/>.9 match → high (>=0.7)
    projects = [proj("johnson", "Johnson Bathroom Renovation")]
    pid, conf, _ = m.match_job_to_project("Johnson Bathroom", "", projects)
    assert (pid, conf) == ("johnson", "high"), f"expected high, got {conf}"
    print("  [ok] exact (slug) and high (surname + word overlap) tiers")


def test_medium_low_none():
    # medium: partial overlap + surname boost lands in [0.4, 0.7)
    projects = [proj("davis", "Davis Porch Addition")]
    pid, conf, _ = m.match_job_to_project("Davis Deck", "", projects)
    assert conf == "medium", f"expected medium, got {conf}"

    # low: one shared word, NO surname boost (first word not in project) → [0.2, 0.4)
    projects = [proj("davis", "Davis Bathroom Remodel")]
    pid, conf, _ = m.match_job_to_project("Zenith Bathroom Project", "", projects)
    assert conf == "low", f"expected low, got {conf}"

    # none: no shared 4+ char words → unmatched
    projects = [proj("davis", "Davis Bathroom Remodel")]
    pid, conf, method = m.match_job_to_project("Quantum Widgets", "", projects)
    assert (pid, conf, method) == (None, None, None), f"expected no match, got {(pid, conf, method)}"
    print("  [ok] medium / low / none tiers")


def test_address_boost_lifts_tier():
    # Same weak name match; the address confirmation (+0.2) lifts low → medium.
    base = [proj("davis", "Davis Bathroom Remodel")]
    _, low_conf, _ = m.match_job_to_project("Zenith Bathroom Project", "999 Far Away Rd", base)
    assert low_conf == "low"

    with_addr = [proj("davis", "Davis Bathroom Remodel", address_slug="123-oak-st")]
    _, hi_conf, _ = m.match_job_to_project("Zenith Bathroom Project", "123 Oak St", with_addr)
    assert hi_conf == "medium", f"address confirmation should lift the tier, got {hi_conf}"
    print("  [ok] address confirmation boost lifts the confidence tier")


if __name__ == "__main__":
    print("\nQB matcher proof")
    print("=" * 70)
    test_helpers()
    test_exact_and_high()
    test_medium_low_none()
    test_address_boost_lifts_tier()
    print("=" * 70)
    print("PASS — confidence tiers, surname boost, and address confirmation all correct.")
    print("=" * 70)
