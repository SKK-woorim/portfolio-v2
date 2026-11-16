import { describe, expect, it } from "vitest";
import { initialRuntimeAvailability, isChatOffline, isChatOnline, parseRuntimeStatusPayload, reduceRuntimeAvailability, runtimeAvailabilityAfterAbort } from "./runtime-availability";

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

describe("runtime availability transitions", () => {
  const states = ["checking", "enabled", "disabled", "unavailable"] as const;

  it("starts disabled only when the deployment turns the chatbot off", () => {
    expect(initialRuntimeAvailability(true)).toBe("disabled");
    expect(initialRuntimeAvailability(false)).toBe("checking");
  });

  it("keeps a known connection visible when the panel opens and rechecks every other state", () => {
    expect(reduceRuntimeAvailability("enabled", { type: "panel-opened" })).toBe("enabled");
    expect(reduceRuntimeAvailability("checking", { type: "panel-opened" })).toBe("checking");
    expect(reduceRuntimeAvailability("disabled", { type: "panel-opened" })).toBe("checking");
    expect(reduceRuntimeAvailability("unavailable", { type: "panel-opened" })).toBe("checking");
  });

  it("adopts whatever the status endpoint reports, from any state", () => {
    for (const state of states) {
      for (const availability of ["enabled", "disabled", "unavailable"] as const) {
        expect(reduceRuntimeAvailability(state, { type: "status-resolved", availability })).toBe(availability);
      }
      expect(reduceRuntimeAvailability(state, { type: "status-failed" })).toBe("unavailable");
      expect(reduceRuntimeAvailability(state, { type: "chat-rejected-as-disabled" })).toBe("disabled");
    }
  });

  it("only lets a timed-out status request change the state", () => {
    for (const state of states) {
      expect(reduceRuntimeAvailability(state, { type: "status-aborted", reason: "timeout" })).toBe("unavailable");
      expect(reduceRuntimeAvailability(state, { type: "status-aborted", reason: "superseded" })).toBe(state);
      expect(reduceRuntimeAvailability(state, { type: "status-aborted", reason: "unmount" })).toBe(state);
    }
  });

  it("reads the status payload defensively", () => {
    expect(parseRuntimeStatusPayload({ status: "enabled" })).toBe("enabled");
    expect(parseRuntimeStatusPayload({ enabled: true })).toBe("enabled");
    expect(parseRuntimeStatusPayload({ status: "disabled", enabled: false })).toBe("disabled");
    expect(parseRuntimeStatusPayload({ status: "unknown" })).toBe("unavailable");
    expect(parseRuntimeStatusPayload(null)).toBe("unavailable");
    expect(parseRuntimeStatusPayload(["enabled"])).toBe("unavailable");
  });

  it("separates offline from still-checking", () => {
    expect(states.filter(isChatOffline)).toEqual(["disabled", "unavailable"]);
    expect(states.filter(isChatOnline)).toEqual(["enabled"]);
  });
});
