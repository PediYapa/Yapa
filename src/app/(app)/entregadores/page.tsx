import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { EntregadoresClient } from "./entregadores-client";

export const dynamic = "force-dynamic";

export default async function EntregadoresPage() {
  const { supabase, profile } = await guard("entregadores", "read");

  const [{ data: rows }, { data: distribuidoras }] = await Promise.all([
    supabase
      .from("entregadores")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("distribuidoras")
      .select("id, nome")
      .is("deleted_at", null)
      .eq("ativo", true)
      .order("nome", { ascending: true }),
  ]);

  return (
    <EntregadoresClient
      rows={rows ?? []}
      distribuidoras={distribuidoras ?? []}
      canWrite={can(profile, "entregadores", "write")}
    />
  );
}
