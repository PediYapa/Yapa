import { MessagesSquare, Inbox, Hourglass, UserCog } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import type { ConversaRow } from "@/lib/database.types";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { AtendimentoClient, type ConversaMini } from "./atendimento-client";

export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  const { supabase, profile } = await guard("atendimento", "read");
  const canWrite = can(profile, "atendimento", "write");

  const { data: conversasData } = await supabase
    .from("conversas")
    .select("*")
    .order("ultima_mensagem_em", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const conversas = (conversasData ?? []) as ConversaRow[];

  // KPIs
  const abertas = conversas.filter((c) => c.status === "aberta").length;
  const pendentes = conversas.filter((c) => c.status === "pendente").length;
  const emHandoff = conversas.filter((c) => c.handoff_humano).length;

  const lista: ConversaMini[] = conversas.map((c) => ({
    id: c.id,
    telefone: c.telefone,
    cliente_id: c.cliente_id,
    status: c.status,
    handoff_humano: c.handoff_humano,
    mensagens: c.mensagens ?? [],
    ultima_mensagem_em: c.ultima_mensagem_em,
  }));

  return (
    <div>
      <PageHeader
        title="Atendimento"
        description="Conversas do WhatsApp e passagem de bastão entre bot e humano."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Conversas abertas" value={abertas} icon={<Inbox />} hint="aguardando ação" />
        <StatCard label="Pendentes" value={pendentes} icon={<Hourglass />} />
        <StatCard label="Em atendimento humano" value={emHandoff} icon={<UserCog />} hint="bot pausado" />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="Nenhuma conversa"
          description="As conversas aparecem aqui conforme os clientes escrevem pelo WhatsApp."
        />
      ) : (
        <AtendimentoClient conversas={lista} canWrite={canWrite} />
      )}
    </div>
  );
}
