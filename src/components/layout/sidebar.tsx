"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { YapaLogo, YapaMark } from "@/components/yapa-logo";
import { NAV_ITEMS, type NavItem } from "./nav-config";
import type { Module } from "@/lib/auth/permissions";

export function Sidebar({ allowed, collapsed }: { allowed: Module[]; collapsed: boolean }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => allowed.includes(i.module));

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center px-0" : "px-6")}>
        {collapsed ? <YapaMark className="text-primary" /> : <YapaLogo />}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => (
          <NavLink key={item.module} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}
      </nav>
      {!collapsed && <div className="px-6 py-4 text-xs text-muted-foreground">Yapa · Ciudad del Este</div>}
    </aside>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && item.label}
    </Link>
  );
}
