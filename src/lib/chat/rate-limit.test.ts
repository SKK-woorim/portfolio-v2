import { describe, expect, it } from "vitest";
import { createChatRateLimitHashes, getClientIp } from "./rate-limit";

describe("chat rate-limit identifiers", () => {
  it("uses the trusted forwarded address first", () => {
    const request = new Request("https://portfolio.example/api/chat", {
      headers: { "x-vercel-forwarded-for": "203.0.113.4, 10.0.0.2" },
    });
    expect(getClientIp(request)).toBe("203.0.113.4");
  });

  it("is stable for a day and rotates the next day", () => {
    const first = createChatRateLimitHashes("203.0.113.4", "session", "secret", new Date("2026-08-24T01:00:00Z"));
    const sameDay = createChatRateLimitHashes("203.0.113.4", "session", "secret", new Date("2026-08-24T23:00:00Z"));
    const nextDay = createChatRateLimitHashes("203.0.113.4", "session", "secret", new Date("2026-08-25T01:00:00Z"));
    expect(first).toEqual(sameDay);
    expect(first).not.toEqual(nextDay);
    expect(first.ipHash).not.toBe(first.sessionHash);
  });
});
