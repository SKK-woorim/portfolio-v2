import { describe, expect, it } from "vitest";
import { runtimeAvailabilityAfterAbort } from "./runtime-availability";

describe("runtime availability request cancellation", () => {
  it("marks a timed-out status request unavailable", () => {
    expect(runtimeAvailabilityAfterAbort("timeout")).toBe("unavailable");
  });

  it("does not overwrite the next request for superseded or unmounted requests", () => {
    expect(runtimeAvailabilityAfterAbort("superseded")).toBeNull();
    expect(runtimeAvailabilityAfterAbort("unmount")).toBeNull();
    expect(runtimeAvailabilityAfterAbort(null)).toBeNull();
  });
});
