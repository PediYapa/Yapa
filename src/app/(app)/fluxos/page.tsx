import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { FluxosClient } from "./fluxos-client";

export const dynamic = "force-dynamic";

export default async function FluxosPage() {
  const { supabase, profile } = await guard("fluxos", "read");

  const [{ data: fluxos }, { data: produtos }] = await Promise.all([
    supabase
      .from("fluxos")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("produtos")
      .select("id, nome, preco_gs, imagem_url")
      .is("deleted_at", null)
      .eq("disponivel", true)
      .order("nome", { ascending: true }),
  ]);

  return (
    <FluxosClient
      fluxos={fluxos ?? []}
      produtos={produtos ?? []}
      canWrite={can(profile, "fluxos", "write")}
    />
  );
}
