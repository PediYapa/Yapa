"use client";

import { useState } from "react";
import { Bike, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tempoRelativoBR } from "@/lib/format";

/** Linha do espelho histórico — agregada por entregador_provedor_id (id estável da operadora). */
export type MotoboyEspelho = {
  provedorId: string;
  nome: string | null;
  telefone: string | null;
  fotoUrl: string | null;
  corridasConcluidas: number;
  ultimaAtividade: string | null;
  emCorridaAgora: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

function statusMotoboy(m: MotoboyEspelho): { label: string; variant: BadgeProps["variant"] } {
  if (m.emCorridaAgora) return { label: "Em corrida agora", variant: "accent" };
  const dias = m.ultimaAtividade ? (Date.now() - new Date(m.ultimaAtividade).getTime()) / DIA_MS : Infinity;
  if (dias <= 7) return { label: "Ativo", variant: "success" };
  if (dias > 30) return { label: "Inativo", variant: "outline" };
  return { label: "Ocioso", variant: "default" }; // entre 7 e 30 dias sem corrida
}

export function MotoboysClient({ motoboys }: { motoboys: MotoboyEspelho[] }) {
  const [busca, setBusca] = useState("");

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? motoboys.filter(
        (m) => (m.nome ?? "").toLowerCase().includes(q) || (m.telefone ?? "").includes(q),
      )
    : motoboys;

  return (
    <div>
      <PageHeader
        title="Motoboys"
        description="Espelho histórico dos entregadores da Entregas Expressas — preenchido automaticamente pelas corridas."
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Bike />}
          title="Nenhum motoboy ainda"
          description="Aparece aqui automaticamente assim que a primeira corrida for aceita pela Entregas Expressas."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motoboy</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Corridas concluídas</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((m) => {
                const st = statusMotoboy(m);
                return (
                  <TableRow key={m.provedorId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {m.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- URL externa da operadora; next/image exigiria remotePatterns por domínio
                          <img src={m.fotoUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                            <Bike className="size-4" />
                          </div>
                        )}
                        <span className="font-medium">{m.nome ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{m.telefone ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.corridasConcluidas}</TableCell>
                    <TableCell suppressHydrationWarning>{tempoRelativoBR(m.ultimaAtividade)}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
