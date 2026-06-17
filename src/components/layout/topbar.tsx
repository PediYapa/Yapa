"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, PanelLeft, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { YapaLogo } from "@/components/yapa-logo";
import { logoutAction } from "@/app/actions/auth";
import { NAV_ITEMS } from "./nav-config";
import type { Module } from "@/lib/auth/permissions";

const ROLE_LABEL: Record<string, string> = { owner: "Dono", gerente: "Gerente", staff: "Equipe" };

export function Topbar({
  nome,
  role,
  allowed,
  collapsed,
  isDark,
  onToggleSidebar,
  onToggleTheme,
}: {
  nome: string;
  role: string;
  allowed: Module[];
  collapsed: boolean;
  isDark: boolean;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => allowed.includes(i.module));
  const iniciais = nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
      <div className="flex items-center gap-2">
        {/* Mobile: abre drawer */}
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
          <Menu />
        </Button>
        {/* Desktop: colapsa sidebar */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={onToggleSidebar}
          aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
          title={collapsed ? "Expandir menu" : "Colapsar menu"}
        >
          <PanelLeft />
        </Button>
        <div className="lg:hidden">
          <YapaLogo compact />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label="Alternar tema" title="Alternar tema">
          {isDark ? <Sun /> : <Moon />}
        </Button>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{nome}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[role] ?? role}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {iniciais}
        </div>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon" type="submit" aria-label="Sair" title="Sair">
            <LogOut />
          </Button>
        </form>
      </div>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <nav className="absolute left-0 top-0 h-full w-72 space-y-1 overflow-y-auto bg-sidebar p-4">
            <div className="mb-4 flex items-center justify-between">
              <YapaLogo />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fechar">
                <X />
              </Button>
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.module}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
