import { describe, expect, it } from "vitest";
import { createChatSignature, verifyChatSignature } from "./signature";

describe("chat HMAC signature", () => {
  it("signs the exact timestamp, request ID, and raw body", () => {
    const signature = createChatSignature("secret", 1_800_000_000, "request-id", '{"message":"안녕"}');
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyChatSignature("secret", 1_800_000_000, "request-id", '{"message":"안녕"}', signature)).toBe(true);
  });

  it("rejects modified bodies and malformed signatures", () => {
    const signature = createChatSignature("secret", 1_800_000_000, "request-id", "body");
    expect(verifyChatSignature("secret", 1_800_000_000, "request-id", "other", signature)).toBe(false);
    expect(verifyChatSignature("secret", 1_800_000_000, "request-id", "body", "invalid")).toBe(false);
  });
});
