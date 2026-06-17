import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { ProdutosClient } from "./produtos-client";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const { supabase, profile } = await guard("produtos", "read");

  const [{ data: rows }, { data: distribuidoras }] = await Promise.all([
    supabase
      .from("produtos")
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
    <ProdutosClient
      rows={rows ?? []}
      distribuidoras={distribuidoras ?? []}
      canWrite={can(profile, "produtos", "write")}
    />
  );
}
