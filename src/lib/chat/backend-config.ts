type ChatBackendEnvironment = {
  CHAT_BACKEND_URL?: string;
  CHAT_BACKEND_SECRET?: string;
  NODE_ENV?: string;
};

export type ChatBackendConfig = {
  chatUrl: string;
  healthUrl: string;
  secret: string;
};

export function getChatBackendConfig(
  environment: ChatBackendEnvironment = process.env,
): ChatBackendConfig {
  const configured = environment.CHAT_BACKEND_URL?.trim();
  if (!configured) throw new Error("CHAT_BACKEND_URL is not configured");

  const base = new URL(configured);
  const isLocalDevelopment = environment.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (base.protocol !== "https:" && !(isLocalDevelopment && base.protocol === "http:")) {
    throw new Error("CHAT_BACKEND_URL must use HTTPS");
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error("CHAT_BACKEND_URL cannot contain credentials, a query, or a fragment");
  }

  const secret = environment.CHAT_BACKEND_SECRET?.trim();
  const loweredSecret = secret?.toLowerCase() ?? "";
  const placeholderMarkers = ["changeme", "replace-me", "placeholder", "<required", "required-"];
  if (
    !secret
    || secret.length < 16
    || secret.includes("<")
    || secret.includes(">")
    || placeholderMarkers.some((marker) => loweredSecret.includes(marker))
  ) {
    throw new Error("CHAT_BACKEND_SECRET must contain at least 16 characters");
  }

  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return {
    chatUrl: new URL("v1/chat", base).toString(),
    healthUrl: new URL("health", base).toString(),
    secret,
  };
}
