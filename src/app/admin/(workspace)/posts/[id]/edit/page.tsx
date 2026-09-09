import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PostForm } from "@/components/admin/post-form";
import { getAdminCategories, getAdminMedia, getAdminPost } from "@/lib/admin/queries";

type PageProps = { params: Promise<{ id: string }> };
export default async function EditPostPage({ params }: PageProps) { const id = (await params).id; const [post, categories, media] = await Promise.all([getAdminPost(id), getAdminCategories(), getAdminMedia()]); if (!post) notFound(); return <div className="mx-auto max-w-4xl"><Link href="/admin/posts" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 게시글 목록</Link><p className="eyebrow mt-9">Edit post</p><h1 className="display mt-3 text-4xl">{post.title}</h1><div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8"><PostForm post={post} categories={categories} media={media} /></div></div>; }
