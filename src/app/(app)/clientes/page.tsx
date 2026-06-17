import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { ClientesClient } from "./clientes-client";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const { supabase, profile } = await guard("clientes", "read");
  const { data } = await supabase
    .from("clientes")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return <ClientesClient rows={data ?? []} canWrite={can(profile, "clientes", "write")} />;
}
