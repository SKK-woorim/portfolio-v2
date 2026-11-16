import { fetchChatbotBackendHealth } from "@/lib/chat/backend-health";
import { createClient } from "@supabase/supabase-js";
import { getChatBackendConfig, type ChatBackendConfig } from "@/lib/chat/backend-config";
import { getChatbotRuntimeStatus, isChatbotMasterEnabled, type ChatbotRuntimeStatus } from "@/lib/chat/runtime-status";
import { getSupabaseConfig, hasSupabaseConfig } from "@/lib/supabase/config";

export const READINESS_DEPENDENCY_TIMEOUT_MS = 1_500;

type ComponentStatus = "ready" | "not_ready" | "disabled";

export type ReadinessStatus = {
  status: "ready" | "not_ready";
  components: {
    supabaseConfig: ComponentStatus;
    publishedContent: ComponentStatus;
    chatbotRelay: ComponentStatus;
    chatbotBackend: ComponentStatus;
  };
};

type ReadinessDependencies = {
  hasSupabaseConfig: () => boolean;
  readPublishedContent: (signal: AbortSignal) => Promise<void>;
  isChatbotMasterEnabled: () => boolean;
  getChatbotRuntimeStatus: (signal?: AbortSignal) => Promise<ChatbotRuntimeStatus>;
  getChatBackendConfig: () => ChatBackendConfig;
  readChatbotBackendHealth: (url: string, signal: AbortSignal) => Promise<void>;
};

const defaultDependencies: ReadinessDependencies = {
  hasSupabaseConfig,
  readPublishedContent,
  isChatbotMasterEnabled,
  getChatbotRuntimeStatus,
  getChatBackendConfig,
  readChatbotBackendHealth,
};

async function runBounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let rejectCancellation: ((reason: Error) => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
    rejectCancellation?.(new Error("Readiness request was cancelled"));
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    controller.abort("timeout");
    rejectCancellation?.(new Error("Readiness dependency timed out"));
  }, timeoutMs);

  try {
    return await Promise.race([operation(controller.signal), cancellation]);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export async function readPublishedContent(signal: AbortSignal) {
  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { error } = await supabase
    .from("portfolio_items")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .abortSignal(signal);

  if (error) throw new Error("Published content readiness query failed");

  // The public portfolio query can succeed while the posts query fails to
  // resolve an ambiguous posts -> media relationship. Probe the exact
  // relation used by the product so readiness does not report a false green.
  const { error: postsError } = await supabase
    .from("posts")
    .select("id, cover_media:media!posts_cover_media_id_fkey(id), inline_media:post_media!post_media_post_id_fkey(role, media:media!post_media_media_id_fkey(id))")
    .eq("status", "published")
    .limit(1)
    .abortSignal(signal);

  if (postsError) throw new Error("Published posts relationship readiness query failed");
}

export async function readChatbotBackendHealth(url: string, signal: AbortSignal) {
  await fetchChatbotBackendHealth(url, signal);
}

export async function probePublishedContent(
  read: ReadinessDependencies["readPublishedContent"],
  timeoutMs = READINESS_DEPENDENCY_TIMEOUT_MS,
  parentSignal?: AbortSignal,
): Promise<ComponentStatus> {
  try {
    await runBounded(read, timeoutMs, parentSignal);
    return "ready";
  } catch {
    return "not_ready";
  }
}

async function probeChatbot(
  dependencies: Pick<
    ReadinessDependencies,
    "isChatbotMasterEnabled" | "getChatbotRuntimeStatus" | "getChatBackendConfig" | "readChatbotBackendHealth"
  >,
  parentSignal?: AbortSignal,
): Promise<{ chatbotRelay: ComponentStatus; chatbotBackend: ComponentStatus }> {
  if (!dependencies.isChatbotMasterEnabled()) {
    return { chatbotRelay: "disabled", chatbotBackend: "disabled" };
  }

  let runtimeStatus: ChatbotRuntimeStatus;
  try {
    runtimeStatus = await runBounded(
      (signal) => dependencies.getChatbotRuntimeStatus(signal),
      READINESS_DEPENDENCY_TIMEOUT_MS,
      parentSignal,
    );
  } catch {
    return { chatbotRelay: "not_ready", chatbotBackend: "not_ready" };
  }
  if (!runtimeStatus.enabled) {
    return { chatbotRelay: "disabled", chatbotBackend: "disabled" };
  }

  let backend: ChatBackendConfig;
  try {
    backend = dependencies.getChatBackendConfig();
  } catch {
    return { chatbotRelay: "not_ready", chatbotBackend: "not_ready" };
  }

  const chatbotBackend = await probePublishedContent(
    (signal) => dependencies.readChatbotBackendHealth(backend.healthUrl, signal),
    READINESS_DEPENDENCY_TIMEOUT_MS,
    parentSignal,
  );
  return { chatbotRelay: "ready", chatbotBackend };
}

export async function getReadinessStatus(
  overrides: Partial<ReadinessDependencies> = {},
  signal?: AbortSignal,
): Promise<ReadinessStatus> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const supabaseConfig = dependencies.hasSupabaseConfig() ? "ready" : "not_ready";
  if (supabaseConfig === "not_ready") {
    const chatbotStatus = dependencies.isChatbotMasterEnabled() ? "not_ready" : "disabled";
    return {
      status: "not_ready",
      components: {
        supabaseConfig,
        publishedContent: "not_ready",
        chatbotRelay: chatbotStatus,
        chatbotBackend: chatbotStatus,
      },
    };
  }

  const [publishedContent, chatbot] = await Promise.all([
    probePublishedContent(dependencies.readPublishedContent, READINESS_DEPENDENCY_TIMEOUT_MS, signal),
    probeChatbot(dependencies, signal),
  ]);
  const chatbotReady = chatbot.chatbotRelay !== "not_ready" && chatbot.chatbotBackend !== "not_ready";

  return {
    status: publishedContent === "ready" && chatbotReady ? "ready" : "not_ready",
    components: { supabaseConfig, publishedContent, ...chatbot },
  };
}
