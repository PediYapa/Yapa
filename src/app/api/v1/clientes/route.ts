import { NextResponse } from "next/server";
import { requireToken, isErrorResponse } from "@/lib/auth/require-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/v1/clientes — lista/busca clientes da org do token (scope clientes:read). */
export async function GET(request: Request) {
  const auth = await requireToken(request, "clientes:read");
  if (isErrorResponse(auth)) return auth;

  const url = new URL(request.url);
  const telefone = url.searchParams.get("telefone");
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const admin = createAdminClient();
  let q = admin
    .from("clientes")
    .select("*")
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (telefone) q = q.eq("telefone", telefone);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
