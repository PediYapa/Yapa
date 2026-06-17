import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { visibleModules } from "@/lib/auth/permissions";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  const allowed = visibleModules(profile);

  const jar = await cookies();
  const defaultCollapsed = jar.get("yapa_sidebar")?.value === "1";
  const defaultDark = jar.get("yapa_theme")?.value === "dark";

  return (
    <AppShell
      nome={profile.nome}
      role={profile.role}
      allowed={allowed}
      defaultCollapsed={defaultCollapsed}
      defaultDark={defaultDark}
    >
      {children}
    </AppShell>
  );
}
