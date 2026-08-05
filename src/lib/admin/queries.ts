import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardData() {
  await requireAdmin();
  const supabase = await createClient();
  const [portfolio, posts, recentPortfolio, recentPosts] = await Promise.all([
    supabase.from("portfolio_items").select("status", { count: "exact" }),
    supabase.from("posts").select("status", { count: "exact" }),
    supabase.from("portfolio_items").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(4),
    supabase.from("posts").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(4),
  ]);
  return {
    portfolio: portfolio.data ?? [], posts: posts.data ?? [],
    recent: [...(recentPortfolio.data ?? []).map((item) => ({ ...item, kind: "포트폴리오" })), ...(recentPosts.data ?? []).map((item) => ({ ...item, kind: "게시글" }))]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6),
  };
}

export async function getAdminPortfolioItems() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("portfolio_items").select("*").order("sort_order", { ascending: true }).order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminPortfolioItem(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("portfolio_items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAdminPosts() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").select("*, categories(name)").order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminPost(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAdminCategories() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getAdminSiteProfile() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_profile").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAdminMedia() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("media").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
