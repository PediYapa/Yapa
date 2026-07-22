"use client";

/**
 * Status fino de entrega em tempo real na tabela de Pedidos.
 *
 * UMA assinatura Supabase Realtime (postgres_changes em yapa.entregas, filtrada
 * por org_id) pra tabela inteira: o Provider mantém um Map pedido_id → evento,
 * inicializado pelos dados do server component; cada linha lê via contexto
 * (EntregaStatusCell) — nunca uma assinatura por linha.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EntregaEventoExterno, EntregaRow } from "@/lib/database.types";
import { entregaStatusLabel, type EntregaStatusTone } from "@/lib/intel/entrega-status-label";
import { cn } from "@/lib/cn";

export type EntregaStatusInicial = Pick<EntregaRow, "pedido_id" | "evento_externo" | "rejeicao_motivo">;

type EntregaInfo = { evento: EntregaEventoExterno | null; motivo: string | null };

const EntregasCtx = createContext<ReadonlyMap<string, EntregaInfo>>(new Map());

export function PedidosRealtimeProvider({
  orgId,
  inicial,
  children,
}: {
  orgId: string;
  inicial: EntregaStatusInicial[];
  children: ReactNode;
}) {
  const [mapa, setMapa] = useState<ReadonlyMap<string, EntregaInfo>>(
    () => new Map(inicial.map((e) => [e.pedido_id, { evento: e.evento_externo, motivo: e.rejeicao_motivo }])),
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pedidos-entregas-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "yapa", table: "entregas", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as Partial<EntregaRow> | null;
          const pedidoId = row?.pedido_id;
          if (!pedidoId) return; // DELETE (payload.new vazio) não interessa aqui
          setMapa((prev) => {
            const next = new Map(prev);
            next.set(pedidoId, { evento: row.evento_externo ?? null, motivo: row.rejeicao_motivo ?? null });
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  return <EntregasCtx.Provider value={mapa}>{children}</EntregasCtx.Provider>;
}

/** tone semântico (lib pura) → classes do design system. */
const TONE_CLASSES: Record<EntregaStatusTone, string> = {
  neutro: "text-foreground border-border",
  azul: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25",
  verde: "bg-success/12 text-success border-success/25",
  cinza: "bg-secondary text-secondary-foreground border-transparent",
  vermelho: "bg-destructive/12 text-destructive border-destructive/25",
};

export function EntregaStatusCell({ pedidoId }: { pedidoId: string }) {
  const mapa = useContext(EntregasCtx);
  const info = mapa.get(pedidoId);
  const meta = entregaStatusLabel(info?.evento);
  if (!meta) return <>—</>;
  return (
    <span
      title={meta.tone === "vermelho" && info?.motivo ? info.motivo : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}
