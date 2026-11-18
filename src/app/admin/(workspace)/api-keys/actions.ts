"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiProviderOrderSchema, aiProviderSchema, setAiProviderKey, setAiProviderOrder } from "@/lib/ai-provider-keys";
import { requireAdmin } from "@/lib/auth/admin";
import type { FormState } from "@/lib/validation/content";

const apiKeySchema = z.string().trim().min(1).max(4096).regex(/^[!-~]+$/);

export async function updateAiProviderKey(
  provider: unknown,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const selectedProvider = aiProviderSchema.safeParse(provider);
  const operation = formData.get("operation");
  if (!selectedProvider.success || (operation !== "save" && operation !== "delete")) {
    return { error: "API 키 설정 요청이 올바르지 않습니다." };
  }

  const apiKey = operation === "delete" ? null : apiKeySchema.safeParse(formData.get("apiKey"));
  if (apiKey && !apiKey.success) return { error: "올바른 API 키를 입력하세요." };

  try {
    await setAiProviderKey(selectedProvider.data, apiKey?.data ?? null);
  } catch {
    return { error: "API 키 설정을 변경하지 못했습니다. 다시 시도하세요." };
  }

  revalidatePath("/admin/api-keys");
  return { success: operation === "delete" ? "API 키를 삭제했습니다." : "API 키를 저장했습니다." };
}

export async function updateAiProviderOrder(_previousState: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const order = formData.get("providerOrder");
  const parsed = aiProviderOrderSchema.safeParse(typeof order === "string" ? order.split(",") : undefined);
  if (!parsed.success) return { error: "GPT, Gemini, 로컬 모델이 각각 한 번씩 포함된 순서를 선택하세요." };

  try {
    await setAiProviderOrder(parsed.data);
  } catch {
    return { error: "호출 순서를 저장하지 못했습니다. 다시 시도하세요." };
  }

  revalidatePath("/admin/api-keys");
  return { success: "호출 순서를 저장했습니다." };
}
