import type { Profile } from "@/lib/auth/session";

/** Módulos do sistema (chaves usadas em module_permissions e na navegação). */
export const MODULES = [
  "dashboard",
  "pedidos",
  "despacho",
  "atendimento",
  "clientes",
  "distribuidoras",
  "entregadores",
  "produtos",
  "fluxos",
  "financeiro",
  "relatorios",
  "usuarios",
  "tokens",
  "configuracoes",
] as const;

export type Module = (typeof MODULES)[number];
export type Action = "read" | "write";

const MODULE_LABELS: Record<Module, string> = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  despacho: "Despacho",
  atendimento: "Atendimento",
  clientes: "Clientes",
  distribuidoras: "Distribuidoras",
  entregadores: "Entregadores",
  produtos: "Catálogo",
  fluxos: "Fluxos",
  financeiro: "Financeiro",
  relatorios: "Relatórios",
  usuarios: "Usuários",
  tokens: "API Tokens",
  configuracoes: "Configurações",
};

export function moduleLabel(m: Module): string {
  return MODULE_LABELS[m];
}

type ModulePermissions = Record<string, Action[]>;

/**
 * Pode o perfil executar `action` em `module`?
 * - owner / gerente: tudo.
 * - operador: depende de module_permissions; dashboard/relatorios liberados p/ leitura.
 *   Áreas administrativas (usuarios, tokens) são bloqueadas para operador.
 */
export function can(
  profile: Pick<Profile, "role" | "module_permissions">,
  module: Module,
  action: Action = "read",
): boolean {
  // hub (parceiro B2B): não acessa o app administrativo — vive só no portal /hub.
  if (profile.role === "hub") return false;

  if (profile.role === "owner" || profile.role === "gerente") return true;

  // operador
  if (module === "usuarios" || module === "tokens") return false; // áreas admin
  const perms = (profile.module_permissions ?? {}) as ModulePermissions;
  const granted = perms[module] ?? [];
  if (action === "read") {
    if (module === "dashboard" || module === "relatorios") return true;
    return granted.includes("read") || granted.includes("write");
  }
  return granted.includes("write");
}

/** Módulos visíveis na navegação para este perfil (com leitura). */
export function visibleModules(profile: Pick<Profile, "role" | "module_permissions">): Module[] {
  return MODULES.filter((m) => can(profile, m, "read"));
}
