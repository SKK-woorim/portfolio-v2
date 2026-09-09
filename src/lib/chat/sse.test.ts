import { describe, expect, it } from "vitest";
import { BackendSseFrameBuffer, encodeSse, parseBackendSseFrame } from "./sse";

describe("backend SSE validation", () => {
  it("reassembles network chunks before parsing", () => {
    const buffer = new BackendSseFrameBuffer();
    expect(buffer.push("event: token\nda")).toEqual([]);
    const frames = buffer.push('ta: {"delta":"안녕"}\n\n');
    expect(frames).toHaveLength(1);
    expect(parseBackendSseFrame(frames[0])).toEqual({ type: "event", value: { event: "token", data: { delta: "안녕" } } });
    expect(() => buffer.finish()).not.toThrow();
  });

  it("handles a CRLF delimiter split across network chunks", () => {
    const buffer = new BackendSseFrameBuffer();
    expect(buffer.push("event: token\r\ndata: {\"delta\":\"안녕\"}\r")).toEqual([]);
    const frames = buffer.push("\n\r\n");
    expect(frames).toEqual(['event: token\ndata: {"delta":"안녕"}']);
    expect(parseBackendSseFrame(frames[0])).toMatchObject({ type: "event" });
  });

  it("accepts heartbeat comments", () => {
    expect(parseBackendSseFrame(": heartbeat")).toEqual({ type: "heartbeat" });
  });

  it("rejects multiline or invalid backend JSON", () => {
    expect(() => parseBackendSseFrame("event: token\ndata: {}\ndata: {}")).toThrow();
    expect(() => parseBackendSseFrame("event: token\ndata: nope")).toThrow();
  });

  it("encodes a single-line JSON data event", () => {
    expect(encodeSse("token", { delta: "첫 줄\n둘째 줄" })).toBe('event: token\ndata: {"delta":"첫 줄\\n둘째 줄"}\n\n');
  });
});
