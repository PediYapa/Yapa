import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import type { UserProfileRow } from "@/lib/database.types";
import { UsuariosClient } from "./usuarios-client";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const { supabase, profile } = await guard("usuarios", "read");
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div>
      <PageHeader title="Usuários" description="Equipe com acesso ao painel do Yapa." />
      <UsuariosClient
        rows={(data ?? []) as UserProfileRow[]}
        canWrite={can(profile, "usuarios", "write")}
        meuId={profile.id}
      />
    </div>
  );
}
