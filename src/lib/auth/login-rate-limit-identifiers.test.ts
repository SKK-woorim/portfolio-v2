import { describe, expect, it } from "vitest";
import {
  createLoginRateLimitHashes,
  getLoginClientIpPrefix,
  normalizeIpPrefix,
} from "./login-rate-limit-identifiers";

describe("login rate-limit identifiers", () => {
  it("groups IPv4 clients by /24 and IPv6 clients by /64", () => {
    expect(normalizeIpPrefix("203.0.113.24")).toBe("203.0.113.0/24");
    expect(normalizeIpPrefix("[2001:db8:1234:5678:abcd::1]:443")).toBe("2001:0db8:1234:5678::/64");
  });

  it("prefers the platform-provided forwarding header", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.20",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(getLoginClientIpPrefix(headers)).toBe("203.0.113.0/24");
  });

  it("creates stable scoped HMACs without retaining raw identifiers", () => {
    const first = createLoginRateLimitHashes("Admin@Example.com", "203.0.113.0/24", "s".repeat(32));
    const repeated = createLoginRateLimitHashes("admin@example.com", "203.0.113.0/24", "s".repeat(32));

    expect(first).toEqual(repeated);
    expect(first.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.emailHash).not.toContain("example");
    expect(first.emailHash).not.toBe(first.ipHash);
  });
});
