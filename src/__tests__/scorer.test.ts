import { describe, it, expect } from "vitest";
import { computeScore } from "../scoring/scorer.js";

const BASE_ROW = {
  id: "test-1",
  usage_count: 10,
  taxonomy: JSON.stringify({ complexity: "high" }),
  updated_at: new Date().toISOString(),
  avg_rating: 4.5,
};

describe("computeScore", () => {
  it("returns a value between 0 and 1", () => {
    const score = computeScore(BASE_ROW, 100);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores higher with better feedback", () => {
    const low = computeScore({ ...BASE_ROW, avg_rating: 1 }, 10);
    const high = computeScore({ ...BASE_ROW, avg_rating: 5 }, 10);
    expect(high).toBeGreaterThan(low);
  });

  it("scores higher with more usage", () => {
    const low = computeScore({ ...BASE_ROW, usage_count: 1 }, 100);
    const high = computeScore({ ...BASE_ROW, usage_count: 100 }, 100);
    expect(high).toBeGreaterThan(low);
  });

  it("uses neutral feedback score when avg_rating is null", () => {
    const withNull = computeScore({ ...BASE_ROW, avg_rating: null }, 10);
    const withMid = computeScore({ ...BASE_ROW, avg_rating: 2.5 }, 10);
    // null should approximate 0.5 neutral, and 2.5/5 = 0.5 exactly
    expect(Math.abs(withNull - withMid)).toBeLessThan(0.05);
  });

  it("returns 0 usage score when maxUsage is 0", () => {
    // Should not throw, should handle gracefully
    const score = computeScore({ ...BASE_ROW, usage_count: 0 }, 0);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
