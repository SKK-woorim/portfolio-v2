import { describe, expect, it } from "vitest";
import { getPortfolioOrderMessageRole, getPortfolioOrderOutcome } from "./portfolio-order-message";

describe("portfolio order result", () => {
  const previous = ["first", "second"];
  const next = ["second", "first"];

  it("rolls back and exposes an alert message when saving fails", () => {
    const outcome = getPortfolioOrderOutcome({ error: "순서를 저장하지 못했습니다." }, next, previous);
    expect(outcome.items).toEqual(previous);
    expect(outcome.message).toEqual({ kind: "error", text: "순서를 저장하지 못했습니다." });
    expect(getPortfolioOrderMessageRole(outcome.message!)).toBe("alert");
  });

  it("keeps the optimistic order and exposes a status message on success", () => {
    const outcome = getPortfolioOrderOutcome({ success: "노출 순서를 저장했습니다." }, next, previous);
    expect(outcome.items).toEqual(next);
    expect(outcome.message).toEqual({ kind: "success", text: "노출 순서를 저장했습니다." });
    expect(getPortfolioOrderMessageRole(outcome.message!)).toBe("status");
  });
});
