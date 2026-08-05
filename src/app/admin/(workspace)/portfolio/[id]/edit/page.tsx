import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PortfolioForm } from "@/components/admin/portfolio-form";
import { getAdminPortfolioItem } from "@/lib/admin/queries";

type PageProps = { params: Promise<{ id: string }> };
export default async function EditPortfolioPage({ params }: PageProps) { const item = await getAdminPortfolioItem((await params).id); if (!item) notFound(); return <div className="mx-auto max-w-4xl"><Link href="/admin/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 포트폴리오 목록</Link><p className="eyebrow mt-9">Edit item</p><h1 className="display mt-3 text-4xl">{item.title}</h1><div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8"><PortfolioForm item={item} /></div></div>; }
