import { describe, expect, it } from "vitest";
import { getChatBackendConfig } from "./backend-config";

const strongSecret = "shared-secret-with-32-random-chars";

describe("getChatBackendConfig", () => {
  it("builds chat and health endpoints from a configured base path", () => {
    expect(getChatBackendConfig({
      CHAT_BACKEND_URL: "https://rag.example/internal",
      CHAT_BACKEND_SECRET: strongSecret,
      NODE_ENV: "production",
    })).toEqual({
      chatUrl: "https://rag.example/internal/v1/chat",
      healthUrl: "https://rag.example/internal/health",
      secret: strongSecret,
    });
  });

  it("allows plain HTTP only for a local development backend", () => {
    expect(getChatBackendConfig({
      CHAT_BACKEND_URL: "http://127.0.0.1:8090",
      CHAT_BACKEND_SECRET: strongSecret,
      NODE_ENV: "development",
    }).healthUrl).toBe("http://127.0.0.1:8090/health");

    expect(() => getChatBackendConfig({
      CHAT_BACKEND_URL: "http://rag.example",
      CHAT_BACKEND_SECRET: strongSecret,
      NODE_ENV: "development",
    })).toThrow(/HTTPS/);
  });

  it("rejects credentials, query strings, fragments, and a missing secret", () => {
    for (const CHAT_BACKEND_URL of [
      "https://user:password@rag.example",
      "https://rag.example?token=value",
      "https://rag.example#health",
    ]) {
      expect(() => getChatBackendConfig({
        CHAT_BACKEND_URL,
        CHAT_BACKEND_SECRET: strongSecret,
        NODE_ENV: "production",
      })).toThrow();
    }

    expect(() => getChatBackendConfig({
      CHAT_BACKEND_URL: "https://rag.example",
      NODE_ENV: "production",
    })).toThrow(/SECRET/);

    expect(() => getChatBackendConfig({
      CHAT_BACKEND_URL: "https://rag.example",
      CHAT_BACKEND_SECRET: "too-short",
      NODE_ENV: "production",
    })).toThrow(/16/);

    expect(() => getChatBackendConfig({
      CHAT_BACKEND_URL: "https://rag.example",
      CHAT_BACKEND_SECRET: "replace-me-with-a-real-secret",
      NODE_ENV: "production",
    })).toThrow(/16/);
  });
});
