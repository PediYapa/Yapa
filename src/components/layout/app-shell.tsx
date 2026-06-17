"use client";

import { useCallback, useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { Module } from "@/lib/auth/permissions";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

export function AppShell({
  nome,
  role,
  allowed,
  defaultCollapsed,
  defaultDark,
  children,
}: {
  nome: string;
  role: string;
  allowed: Module[];
  defaultCollapsed: boolean;
  defaultDark: boolean;
  children: React.ReactNode;
}) {
  // Estado inicial vem do servidor (cookie) → bate com o SSR, sem flash/mismatch.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [isDark, setIsDark] = useState(defaultDark);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      setCookie("yapa_sidebar", next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      setCookie("yapa_theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar allowed={allowed} collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          nome={nome}
          role={role}
          allowed={allowed}
          collapsed={collapsed}
          isDark={isDark}
          onToggleSidebar={toggleSidebar}
          onToggleTheme={toggleTheme}
        />
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
