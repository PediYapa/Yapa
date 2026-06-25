import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { ClientesClient } from "./clientes-client";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const { supabase, profile } = await guard("clientes", "read");

  // Base editável (CRUD) + métricas vivas do CRM (view clientes_metricas).
  const [{ data: base }, { data: metricas }] = await Promise.all([
    supabase.from("clientes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("clientes_metricas").select("*"),
  ]);

  const metricasMap = new Map((metricas ?? []).map((m) => [m.cliente_id, m]));

  // Enriquece cada cliente com as métricas calculadas (substitui as colunas estáticas).
  const rows = (base ?? []).map((c) => {
    const m = metricasMap.get(c.id);
    return {
      ...c,
      total_pedidos: m?.total_pedidos ?? 0,
      ticket_medio_gs: m?.ticket_medio ?? 0,
      ultima_compra: m?.ultima_compra ?? null,
    };
  });

  return <ClientesClient rows={rows} canWrite={can(profile, "clientes", "write")} />;
}
