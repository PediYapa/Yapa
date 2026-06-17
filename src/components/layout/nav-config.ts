import {
  LayoutDashboard,
  ShoppingBag,
  Bike,
  MessagesSquare,
  Users,
  Store,
  Beer,
  Wallet,
  BarChart3,
  UserCog,
  KeyRound,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Module } from "@/lib/auth/permissions";

export type NavItem = { module: Module; label: string; href: string; icon: LucideIcon };

/** Itens de navegação na ordem do menu. A visibilidade é filtrada por permissão. */
export const NAV_ITEMS: NavItem[] = [
  { module: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { module: "pedidos", label: "Pedidos", href: "/pedidos", icon: ShoppingBag },
  { module: "despacho", label: "Despacho", href: "/despacho", icon: Bike },
  { module: "atendimento", label: "Atendimento", href: "/atendimento", icon: MessagesSquare },
  { module: "clientes", label: "Clientes", href: "/clientes", icon: Users },
  { module: "distribuidoras", label: "Distribuidoras", href: "/distribuidoras", icon: Store },
  { module: "entregadores", label: "Entregadores", href: "/entregadores", icon: Bike },
  { module: "produtos", label: "Catálogo", href: "/produtos", icon: Beer },
  { module: "financeiro", label: "Financeiro", href: "/financeiro", icon: Wallet },
  { module: "relatorios", label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  { module: "usuarios", label: "Usuários", href: "/usuarios", icon: UserCog },
  { module: "tokens", label: "API Tokens", href: "/tokens", icon: KeyRound },
  { module: "configuracoes", label: "Configurações", href: "/configuracoes", icon: Settings },
];
