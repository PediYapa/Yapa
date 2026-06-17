import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { DistribuidorasClient } from "./distribuidoras-client";

export const dynamic = "force-dynamic";

export default async function DistribuidorasPage() {
  const { supabase, profile } = await guard("distribuidoras", "read");
  const { data } = await supabase
    .from("distribuidoras")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return <DistribuidorasClient rows={data ?? []} canWrite={can(profile, "distribuidoras", "write")} />;
}
