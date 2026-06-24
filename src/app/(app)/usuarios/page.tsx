import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserProfileRow } from "@/lib/database.types";
import { UsuariosClient } from "./usuarios-client";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const { supabase, profile } = await guard("usuarios", "read");

  const [{ data }, authList] = await Promise.all([
    supabase.from("user_profiles").select("*").order("created_at", { ascending: true }),
    createAdminClient().auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emails: Record<string, string> = {};
  for (const u of authList.data?.users ?? []) {
    if (u.email) emails[u.id] = u.email;
  }

  return (
    <UsuariosClient
      rows={(data ?? []) as UserProfileRow[]}
      emails={emails}
      canWrite={can(profile, "usuarios", "write")}
      meuId={profile.id}
    />
  );
}
