/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { MediaUploadForm } from "@/components/admin/media-upload-form";
import { MediaAltForm } from "@/components/admin/media-alt-form";
import { MediaDeleteForm } from "@/components/admin/media-delete-form";
import { MediaUrlCopyButton } from "@/components/admin/media-url-copy-button";
import { getAdminMedia, getAdminMediaDeletionJobs } from "@/lib/admin/queries";

function fileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
}

export default async function AdminMediaPage() {
  const [media, deletionJobs] = await Promise.all([
    getAdminMedia(),
    getAdminMediaDeletionJobs(),
  ]);

  return <div className="mx-auto max-w-6xl">
    <p className="eyebrow">Asset library</p>
    <h1 className="display mt-3 text-4xl">미디어</h1>
    <p className="mt-3 text-sm text-[var(--body)]">공개 콘텐츠에서 사용할 이미지를 업로드하고 사용처까지 확인합니다.</p>
    {deletionJobs.length ? <section aria-labelledby="pending-media-deletions" className="mt-6 rounded-3xl border border-[#e5b45b] bg-[#fff8e8] p-5 sm:p-6">
      <h2 id="pending-media-deletions" className="font-semibold text-[#775017]">완료되지 않은 파일 삭제</h2>
      <p className="mt-1 text-sm leading-6 text-[#775017]">데이터 기록은 정리됐지만 Storage 파일 삭제를 다시 확인해야 합니다.</p>
      <ul className="mt-4 grid gap-3">
        {deletionJobs.map((job) => <li key={job.media_id} className="rounded-2xl border border-[#e5b45b]/70 bg-white px-4 py-3">
          <p className="break-all text-xs text-[var(--muted)]">{job.storage_key}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">이전 실패 {job.attempt_count}회</p>
          <MediaDeleteForm id={job.media_id} retry />
        </li>)}
      </ul>
    </section> : null}
    <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
      <MediaUploadForm />
      <section aria-label="업로드한 미디어" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {media.map((item) => <article className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white" key={item.id}>
          <div className="aspect-[4/3] bg-[#edf3fb]">
            <img className="size-full object-cover" src={item.public_url} alt={item.alt || ""} />
          </div>
          <div className="p-4">
            <p className="truncate text-sm font-semibold">{item.alt || "장식용 이미지"}</p>
            <p className="mt-1 truncate text-xs text-[var(--muted)]">{item.storage_key}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {item.mime_type} · {fileSize(Number(item.size_bytes))}
              {item.width && item.height ? ` · ${item.width}×${item.height}px` : ""}
            </p>
            <div className="mt-3 rounded-xl bg-[#f8fbff] px-3 py-2">
              <p className="text-xs font-semibold text-[var(--ink)]">{item.usage_count ? `사용 중 · ${item.usage_count}곳` : "현재 사용하지 않음"}</p>
              {item.usages.length ? <ul className="mt-1 grid gap-1">
                {item.usages.slice(0, 3).map((usage) => <li key={`${usage.kind}-${usage.href}`}><Link href={usage.href} className="focus-ring text-xs text-[var(--primary)] underline-offset-2 hover:underline">{usage.label}</Link></li>)}
                {item.usages.length > 3 ? <li className="text-xs text-[var(--muted)]">외 {item.usages.length - 3}곳</li> : null}
              </ul> : null}
            </div>
            <MediaAltForm id={item.id} initialAlt={item.alt} />
            <div className="mt-4 grid gap-3">
              <MediaUrlCopyButton url={item.public_url} />
              {item.usage_count ? <p className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Trash2 size={14} /> 사용 중인 이미지는 삭제할 수 없습니다.</p> : <MediaDeleteForm id={item.id} />}
            </div>
          </div>
        </article>)}
        {!media.length ? <div className="col-span-full grid min-h-64 place-items-center rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--body)]">업로드한 미디어가 없습니다.</div> : null}
      </section>
    </div>
  </div>;
}
