import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PortfolioForm } from "@/components/admin/portfolio-form";
import { getAdminMedia } from "@/lib/admin/queries";

export default async function NewPortfolioPage() { const media = await getAdminMedia(); return <div className="mx-auto max-w-4xl"><Link href="/admin/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 포트폴리오 목록</Link><p className="eyebrow mt-9">New item</p><h1 className="display mt-3 text-4xl">포트폴리오 작성</h1><div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8"><PortfolioForm media={media} /></div></div>; }
