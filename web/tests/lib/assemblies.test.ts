import { describe, it, expect } from "vitest";
import { ASSEMBLIES, ASSEMBLY_LIST, ASSEMBLY_CATEGORIES, expandAssembly } from "@/lib/assemblies";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const NEW_KEYS = [
  "guest-house",
  "master-suite",
  "sunroom",
  "carport",
  "mudroom-laundry",
  "whole-home-renovation",
  "exterior-renovation",
  "barndominium",
  "bathroom-addition",
  "garage-addition",
  "pole-barn",
  "half-bath",
];

const PREEXISTING_KEYS = Object.keys(ASSEMBLIES).filter((k) => !NEW_KEYS.includes(k));

// The catalog-proven palette: every line description used by the pre-existing
// assemblies (all of which attach real median rates). New templates must stay
// inside this set, or buildLines would emit a blank "missing" line at runtime.
const PALETTE = new Set(PREEXISTING_KEYS.flatMap((k) => ASSEMBLIES[k].lines.map((l) => norm(l.desc))));

describe("assemblies — structural invariants (all templates)", () => {
  it("every assembly declares a known category", () => {
    for (const a of Object.values(ASSEMBLIES)) {
      expect(ASSEMBLY_CATEGORIES).toContain(a.category);
    }
  });

  it("every assembly expands to a non-empty scope with finite, positive quantities", () => {
    for (const key of Object.keys(ASSEMBLIES)) {
      const exp = expandAssembly(key, {});
      expect(exp, key).not.toBeNull();
      expect(exp!.descriptions.length, key).toBeGreaterThan(0);
      for (const q of exp!.qtyByCanon.values()) {
        expect(Number.isFinite(q), key).toBe(true);
        expect(q, key).toBeGreaterThan(0);
      }
    }
  });

  it("the key on each assembly matches its map key", () => {
    for (const [key, a] of Object.entries(ASSEMBLIES)) {
      expect(a.key).toBe(key);
    }
  });
});

describe("assemblies — new future-facing templates", () => {
  it("every new template exists and is listed for the picker", () => {
    for (const k of NEW_KEYS) {
      expect(ASSEMBLIES[k], k).toBeDefined();
      expect(ASSEMBLY_LIST.find((a) => a.key === k), k).toBeTruthy();
    }
  });

  // Typo guard: a misspelled description silently prices as a blank line. Every new
  // template line must reuse a catalog-proven description.
  it("new templates only use catalog-proven line descriptions", () => {
    for (const key of NEW_KEYS) {
      for (const l of ASSEMBLIES[key].lines) {
        expect(PALETTE.has(norm(l.desc)), `${key}: "${l.desc}" is not in the proven catalog palette`).toBe(true);
      }
    }
  });

  it("signature lines are wired into representative new templates", () => {
    const descs = (k: string) => expandAssembly(k, {})!.descriptions.map(norm);
    expect(descs("carport")).toContain(norm("Wood Post & Column Material"));
    expect(descs("barndominium")).toContain(norm("Slab Material"));
    expect(descs("barndominium")).toContain(norm("Drywall"));
    expect(descs("guest-house")).toContain(norm("Appliances"));
    expect(descs("whole-home-renovation")).toContain(norm("Structure Demolition"));
    expect(descs("exterior-renovation")).toContain(norm("Shingle Roofing Material"));
    expect(descs("bathroom-addition")).toContain(norm("Plumbing Fixtures"));
    expect(descs("garage-addition")).toContain(norm("Slab Material"));
    expect(descs("pole-barn")).toContain(norm("Wood Post & Column Material"));
    expect(descs("half-bath")).toContain(norm("Plumbing Material & Labor"));
  });

  it("half-bath stays lighter than a full bathroom addition (no shower)", () => {
    const half = expandAssembly("half-bath", {})!.descriptions.map(norm);
    const full = expandAssembly("bathroom-addition", {})!.descriptions.map(norm);
    expect(half).not.toContain(norm("Shower Tile"));
    expect(full).toContain(norm("Shower Tile"));
  });

  it("a full build template spans foundation, shell, mechanicals, and finishes", () => {
    const descs = expandAssembly("barndominium", {})!.descriptions.map(norm);
    expect(descs).toContain(norm("Footing Material")); // foundation
    expect(descs).toContain(norm("Framing Material")); // shell
    expect(descs).toContain(norm("HVAC Material")); // mechanicals
    expect(descs).toContain(norm("Kitchen Cabinets")); // finishes
  });
});
