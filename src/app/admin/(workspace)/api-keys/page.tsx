import { AiProviderKeyForm } from "@/components/admin/ai-provider-key-form";
import { getAiProviderKeyMetadata, type AiProvider } from "@/lib/ai-provider-keys";
import { requireAdmin } from "@/lib/auth/admin";

const labels = {
  openai: "OpenAI (GPT)",
  gemini: "Google Gemini",
} satisfies Record<AiProvider, string>;

const providers = ["openai", "gemini"] as const;

export default async function AdminApiKeysPage() {
  await requireAdmin();
  const metadata = await getAiProviderKeyMetadata().catch(() => null);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="display text-4xl">API 키</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--body)]">
        챗봇은 키가 등록된 OpenAI GPT와 Google Gemini를 이 순서로 시도합니다. 두 모델에서 답변을 받지 못하면 로컬 모델을 사용합니다.
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--body)]">
        외부 모델을 호출할 때 질문, 최근 대화, 검색된 공개 콘텐츠의 일부가 해당 제공자에 전송됩니다.
      </p>
      {metadata ? (
        <div className="mt-8 grid gap-5 xl:grid-cols-2">
          {providers.map((provider) => (
            <AiProviderKeyForm
              key={provider}
              provider={provider}
              label={labels[provider]}
              updatedAt={metadata.find((entry) => entry.provider === provider)?.updated_at}
            />
          ))}
        </div>
      ) : (
        <p role="alert" className="mt-8 rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">
          API 키 설정을 불러오지 못했습니다. 잠시 후 새로고침하거나 배포 설정을 확인하세요.
        </p>
      )}
    </div>
  );
}
