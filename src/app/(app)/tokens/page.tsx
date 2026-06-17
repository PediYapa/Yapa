import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import type { ApiTokenRow } from "@/lib/database.types";
import { TokensClient } from "./tokens-client";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const { supabase, profile } = await guard("tokens", "read");
  const { data } = await supabase
    .from("api_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  return <TokensClient rows={(data ?? []) as ApiTokenRow[]} canWrite={can(profile, "tokens", "write")} />;
}
