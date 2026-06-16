import { describe, it, expect } from "vitest";
import { matchProject } from "@/lib/match-project";

const P = (name: string, id = name) => ({ id, name });

describe("matchProject", () => {
  it("matches on a distinctive token", () => {
    const projects = [P("Kingery Residence"), P("Smith Addition")];
    expect(matchProject(projects, "order tile for kingery")?.id).toBe("Kingery Residence");
  });

  it("augments with the board name (generic card on a job-named board)", () => {
    const projects = [P("Kingery Reno")];
    // card "order tile" alone has no distinctive token; folding in the board name rescues it
    expect(matchProject(projects, "order tile Kingery Reno")?.id).toBe("Kingery Reno");
  });

  it("respects the 50% distinctive-token threshold", () => {
    const projects = [P("Smith Johnson Build")]; // distinctive: smith, johnson (build is STOP)
    expect(matchProject(projects, "smith only")?.id).toBe("Smith Johnson Build"); // 1/2 = 0.5 ok
    expect(matchProject(projects, "nothing relevant here")).toBeNull();
  });

  it("ignores generic/STOP words — a project with no distinctive tokens never matches", () => {
    expect(matchProject([P("Kitchen Remodel")], "kitchen remodel")).toBeNull();
  });

  it("ignores tokens of 3 chars or fewer", () => {
    expect(matchProject([P("Bob Lee")], "bob lee")).toBeNull(); // both <=3 chars
  });

  it("returns null on empty haystack", () => {
    expect(matchProject([P("Kingery Residence")], "")).toBeNull();
  });

  it("prefers the project with more token hits", () => {
    const projects = [P("Kingery Residence", "a"), P("Kingery Oxford Residence", "b")];
    // both share kingery+residence; "b" also matches oxford -> more hits
    expect(matchProject(projects, "kingery oxford residence work")?.id).toBe("b");
  });
});
