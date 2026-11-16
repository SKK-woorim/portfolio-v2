import { getChatBackendConfig } from "./backend-config";
import { fetchChatbotBackendHealth } from "./backend-health";
import { parseChatbotModelLabel } from "./model-label";

/** Called by next.config only at build/start, never by page or status requests. */
export async function getBuildModelLabel(): Promise<string> {
  try {
    const { healthUrl } = getChatBackendConfig();
    const health = await fetchChatbotBackendHealth(healthUrl, AbortSignal.timeout(1_500));
    if (health.modelLabel) return health.modelLabel;
  } catch {
    // A display label must not prevent building while the model server is offline.
  }
  return parseChatbotModelLabel(process.env.NEXT_PUBLIC_CHATBOT_MODEL_LABEL) ?? "서버 모델";
}
