import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Client service-role — BYPASSA RLS. Usar SOMENTE no servidor:
 *  - rotas /api/v1/* (a constraint de org_id vem do token, em código)
 *  - operações administrativas (criar usuário, etc.)
 * NUNCA importar em Client Components nem expor a chave.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    db: { schema: "yapa" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
