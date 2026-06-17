import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Profile = Database["yapa"]["Tables"]["user_profiles"]["Row"];

/** Retorna o usuário autenticado + perfil, ou redireciona para /login. */
export async function requireUser(): Promise<{ userId: string; profile: Profile }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/login");
  return { userId: user.id, profile: profile as Profile };
}

/** Versão não-redirecionante (para uso em pontos que tratam o null). */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data ?? null) as Profile | null;
}
