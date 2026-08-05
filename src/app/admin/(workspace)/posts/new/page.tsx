import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostForm } from "@/components/admin/post-form";
import { getAdminCategories } from "@/lib/admin/queries";

export default async function NewPostPage() { const categories = await getAdminCategories(); return <div className="mx-auto max-w-4xl"><Link href="/admin/posts" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 게시글 목록</Link><p className="eyebrow mt-9">New post</p><h1 className="display mt-3 text-4xl">게시글 작성</h1><div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8"><PostForm categories={categories} /></div></div>; }
