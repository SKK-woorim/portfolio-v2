import { describe, expect, it } from "vitest";
import { bentoSizes } from "./project-card";

describe("bentoSizes", () => {
  it("fills every row of the twelve-column bento", () => {
    const span = { feature: 7, side: 5, half: 6, wide: 12, third: 4 } as const;
    for (let count = 1; count <= 12; count += 1) {
      const sizes = bentoSizes(count);
      expect(sizes).toHaveLength(count);
      const rest = sizes.filter((size) => size !== "feature" && size !== "side");
      expect(rest.reduce((total, size) => total + span[size], 0) % 12).toBe(0);
    }
  });

  it("gives the first project the large slot when there are at least three", () => {
    expect(bentoSizes(5)).toEqual(["feature", "side", "side", "half", "half"]);
    expect(bentoSizes(6)).toEqual(["feature", "side", "side", "third", "third", "third"]);
  });
});
