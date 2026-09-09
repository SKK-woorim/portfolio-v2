import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contentToMarkdown, markdownToPlainText } from "../src/lib/content/markdown";

type PortfolioContentRow = {
  id: string;
  title: string;
  content_json: unknown;
  content_text: string | null;
};

const PAGE_SIZE = 500;

export function buildPortfolioContentText(content: unknown) {
  return markdownToPlainText(contentToMarkdown(content));
}

async function run() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.argv.includes("--dry-run");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let offset = 0;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const { data, error } = await supabase
      .from("portfolio_items")
      .select("id, title, content_json, content_text")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load portfolio items: ${error.message}`);

    const rows = (data ?? []) as PortfolioContentRow[];
    for (const row of rows) {
      scanned += 1;
      const contentText = buildPortfolioContentText(row.content_json);
      if ((row.content_text ?? "") === contentText) continue;
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("portfolio_items")
          .update({ content_text: contentText })
          .eq("id", row.id);
        if (updateError) throw new Error(`Failed to update portfolio item ${row.id}: ${updateError.message}`);
      }
      updated += 1;
      console.log(`${dryRun ? "would update" : "updated"}: ${row.id} (${row.title})`);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`${dryRun ? "dry run complete" : "backfill complete"}: scanned=${scanned}, updated=${updated}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Portfolio content-text backfill failed.");
    process.exitCode = 1;
  });
}
