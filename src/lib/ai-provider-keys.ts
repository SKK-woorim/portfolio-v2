import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const aiProviderSchema = z.enum(["openai", "gemini"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

const generationProviderSchema = z.union([aiProviderSchema, z.literal("local")]);
export const aiProviderOrderSchema = z
  .tuple([generationProviderSchema, generationProviderSchema, generationProviderSchema])
  .refine((order) => new Set(order).size === order.length);
export type AiProviderOrder = z.infer<typeof aiProviderOrderSchema>;

const keyMetadataSchema = z.array(z.object({
  provider: aiProviderSchema,
  updated_at: z.iso.datetime({ offset: true }),
}));

function createKeyStoreClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("AI provider key store is not configured");

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

const configurationMetadataSchema = z.object({
  provider_order: aiProviderOrderSchema,
  keys: keyMetadataSchema,
});

export async function getAiProviderConfigurationMetadata() {
  const { data, error } = await createKeyStoreClient().rpc("get_ai_provider_configuration", { p_include_values: false });
  const result = configurationMetadataSchema.safeParse(data);
  if (error || !result.success) throw new Error("Could not load AI provider configuration");
  return result.data;
}

export async function setAiProviderOrder(order: AiProviderOrder) {
  const { error } = await createKeyStoreClient().rpc("set_ai_provider_order", { p_provider_order: order });
  if (error) throw new Error("Could not update AI provider order");
}

export async function setAiProviderKey(provider: AiProvider, apiKey: string | null) {
  const { error } = await createKeyStoreClient().rpc("set_ai_provider_key", {
    p_provider: provider,
    p_api_key: apiKey,
  });
  if (error) throw new Error("Could not update AI provider key");
}
