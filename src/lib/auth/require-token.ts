import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";

export type TokenAuth = { tokenId: string; orgId: string; scopes: string[] };

/**
 * Autentica uma requisição da API pública (/api/v1) via Bearer token.
 * Retorna TokenAuth em sucesso ou um NextResponse de erro (401/403).
 * O org_id retornado é a fronteira de tenant para esta superfície.
 */
export async function requireToken(
  request: Request,
  requiredScope: string,
): Promise<TokenAuth | NextResponse> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return NextResponse.json(
      { error: "Token ausente. Envie no header Authorization: Bearer <token>" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const hash = hashToken(match[1]);
  const { data: token } = await admin
    .from("api_tokens")
    .select("id, org_id, scopes, expires_at, revogado_em")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!token || token.revogado_em) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 401 });
  }
  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expirado" }, { status: 401 });
  }

  const scopes = (token.scopes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!scopes.includes(requiredScope)) {
    return NextResponse.json(
      { error: `Token não tem o escopo necessário: "${requiredScope}"` },
      { status: 403 },
    );
  }

  // atualiza ultimo_uso sem bloquear a resposta
  void admin.from("api_tokens").update({ ultimo_uso: new Date().toISOString() }).eq("id", token.id);

  return { tokenId: token.id, orgId: token.org_id, scopes };
}

export function isErrorResponse(x: TokenAuth | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
