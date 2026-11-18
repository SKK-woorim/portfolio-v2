import { AiProviderKeyForm } from "@/components/admin/ai-provider-key-form";
import { AiProviderOrderForm } from "@/components/admin/ai-provider-order-form";
import { getAiProviderConfigurationMetadata, type AiProvider } from "@/lib/ai-provider-keys";
import { requireAdmin } from "@/lib/auth/admin";

const labels = {
  openai: "OpenAI (GPT)",
  gemini: "Google Gemini",
} satisfies Record<AiProvider, string>;

const providers = ["openai", "gemini"] as const;

export default async function AdminApiKeysPage() {
  await requireAdmin();
  const metadata = await getAiProviderConfigurationMetadata().catch(() => null);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="display text-4xl">API 키</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--body)]">
        실시간 질문에 답할 모델의 호출 순서와 외부 모델의 API 키를 설정합니다.
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--body)]">
        외부 모델을 호출할 때 질문, 최근 대화, 검색된 공개 콘텐츠의 일부가 해당 제공자에 전송됩니다.
      </p>
      {metadata ? (
        <div className="mt-8 space-y-5">
          <AiProviderOrderForm order={metadata.provider_order} />
          <div className="grid gap-5 xl:grid-cols-2">
            {providers.map((provider) => (
              <AiProviderKeyForm
                key={provider}
                provider={provider}
                label={labels[provider]}
                updatedAt={metadata.keys.find((entry) => entry.provider === provider)?.updated_at}
              />
            ))}
          </div>
        </div>
      ) : (
        <p role="alert" className="mt-8 rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">
          모델 호출 순서와 API 키 설정을 불러오지 못했습니다. 잠시 후 새로고침하거나 배포 설정을 확인하세요.
        </p>
      )}
    </div>
  );
}
