import { describe, expect, it } from "vitest";
import { chatErrorCodeSchema } from "./contracts";
import { CHAT_ERROR_CODES, CHAT_ERROR_MESSAGES, chatErrorMessage, isChatErrorCode } from "./error-messages";

describe("chat error messages", () => {
  it("has user copy for every code the contract accepts", () => {
    expect(chatErrorCodeSchema.options).toEqual([...CHAT_ERROR_CODES]);
    for (const code of CHAT_ERROR_CODES) expect(CHAT_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
  });

  it("prefers a usable supplied message and falls back by code", () => {
    expect(chatErrorMessage("RATE_LIMITED", "  잠시 뒤 다시 질문해 주세요.  ")).toBe("잠시 뒤 다시 질문해 주세요.");
    expect(chatErrorMessage("RATE_LIMITED", "")).toBe(CHAT_ERROR_MESSAGES.RATE_LIMITED);
    expect(chatErrorMessage("RATE_LIMITED", "가".repeat(301))).toBe(CHAT_ERROR_MESSAGES.RATE_LIMITED);
    expect(chatErrorMessage("RATE_LIMITED", 42)).toBe(CHAT_ERROR_MESSAGES.RATE_LIMITED);
  });

  it("treats unknown and prototype-named codes as an internal error", () => {
    expect(isChatErrorCode("toString")).toBe(false);
    expect(chatErrorMessage("toString")).toBe(CHAT_ERROR_MESSAGES.INTERNAL_ERROR);
    expect(chatErrorMessage("SOMETHING_NEW")).toBe(CHAT_ERROR_MESSAGES.INTERNAL_ERROR);
  });
});
