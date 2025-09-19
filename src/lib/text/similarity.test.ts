import { diceCoefficient, jaroDistance, jaroWinklerDistance } from "@/lib/text/similarity";

describe("similarity", () => {
  it("computes dice coefficient", () => {
    const score = diceCoefficient("automation", "automate");
    expect(score).toBeGreaterThan(0.5);
  });

  it("computes jaro distance and winkler boost", () => {
    const base = jaroDistance("meeting", "meting");
    const winkler = jaroWinklerDistance("meeting", "meting");
    expect(base).toBeLessThanOrEqual(winkler);
    expect(winkler).toBeGreaterThan(0.85);
  });
});
