/** Escopos válidos para tokens de API — arquivo sem "use server" para ser importável no client. */
export const TOKEN_SCOPES = [
  "pedidos:read",
  "pedidos:write",
  "clientes:read",
  "clientes:write",
  "distribuidoras:read",
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];
