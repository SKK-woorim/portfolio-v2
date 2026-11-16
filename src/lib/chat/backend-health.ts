import { parseChatbotModelLabel } from "./model-label";

export async function fetchChatbotBackendHealth(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Chatbot backend health check failed");

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    throw new Error("Chatbot backend health response is too large");
  }

  if (!response.body) throw new Error("Chatbot backend health response is invalid");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > 4_096) {
        throw new Error("Chatbot backend health response is too large");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Chatbot backend health response is invalid");
  }
  const health = parsed as Record<string, unknown>;
  if (health.status !== "ok" || health.embeddingReady !== true || health.modelReady !== true) {
    throw new Error("Chatbot backend is not ready");
  }
  return { modelLabel: parseChatbotModelLabel(health.modelLabel) };
}

