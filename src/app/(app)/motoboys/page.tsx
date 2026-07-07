import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { MotoboysClient } from "./motoboys-client";

export const dynamic = "force-dynamic";

export default async function MotoboysPage() {
  const { supabase, profile } = await guard("motoboys", "read");

  const [{ data: rows }, { data: distribuidoras }] = await Promise.all([
    supabase
      .from("motoboys")
      .select("*")
      .order("criado_em", { ascending: false }),
    supabase
      .from("distribuidoras")
      .select("id, nome")
      .is("deleted_at", null)
      .eq("ativo", true)
      .order("nome", { ascending: true }),
  ]);

  return (
    <MotoboysClient
      rows={rows ?? []}
      distribuidoras={distribuidoras ?? []}
      canWrite={can(profile, "motoboys", "write")}
    />
  );
}
