import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/** Client Supabase para Client Components (browser). */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "yapa" } },
  );
}
