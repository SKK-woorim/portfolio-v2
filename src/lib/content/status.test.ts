import { describe, expect, it } from "vitest";
import { CONTENT_STATUSES, CONTENT_STATUS_LABELS, availableContentTransitions, canTransitionContent, contentStatusLabel, isContentStatus } from "./status";

describe("content publication status machine", () => {
  // DB 함수 transition_content_status_atomic과 같은 표여야 한다.
  it.each([
    ["draft", ["publish", "trash"]],
    ["hidden", ["publish", "trash"]],
    ["private", ["publish", "trash"]],
    ["published", ["unpublish", "trash"]],
    ["trashed", ["restore"]],
  ] as const)("offers %s → %j", (status, transitions) => {
    expect(availableContentTransitions(status)).toEqual(transitions);
  });

  it("covers every status with a label and at least one way out", () => {
    for (const status of CONTENT_STATUSES) {
      expect(CONTENT_STATUS_LABELS[status]).toBeTruthy();
      expect(availableContentTransitions(status).length).toBeGreaterThan(0);
    }
  });

  it("rejects transitions the database would refuse", () => {
    expect(canTransitionContent("published", "publish")).toBe(false);
    expect(canTransitionContent("draft", "unpublish")).toBe(false);
    expect(canTransitionContent("trashed", "trash")).toBe(false);
    expect(canTransitionContent("trashed", "publish")).toBe(false);
    expect(canTransitionContent("draft", "restore")).toBe(false);
  });

  it("leaves unknown statuses to the database", () => {
    expect(isContentStatus("archived")).toBe(false);
    expect(availableContentTransitions("archived")).toEqual([]);
    expect(contentStatusLabel("archived")).toBe("archived");
    expect(contentStatusLabel("hidden")).toBe("숨김");
  });
});
