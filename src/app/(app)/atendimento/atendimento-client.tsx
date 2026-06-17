"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, UserCheck, Bot, MessagesSquare } from "lucide-react";
import type { ConversaStatus, ConversaMensagem } from "@/lib/database.types";
import { alternarHandoff, mudarStatusConversa, enviarMensagem } from "@/app/actions/atendimento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { dataHoraBR, telBR } from "@/lib/format";
import { cn } from "@/lib/cn";

export type ConversaMini = {
  id: string;
  telefone: string;
  cliente_id: string | null;
  status: ConversaStatus;
  handoff_humano: boolean;
  mensagens: ConversaMensagem[];
  ultima_mensagem_em: string | null;
};

const STATUS_META: Record<ConversaStatus, { label: string; variant: "primary" | "warning" | "success" | "outline" }> = {
  aberta: { label: "Aberta", variant: "primary" },
  pendente: { label: "Pendente", variant: "warning" },
  resolvida: { label: "Resolvida", variant: "success" },
  arquivada: { label: "Arquivada", variant: "outline" },
};

const STATUS_OPCOES: ConversaStatus[] = ["aberta", "pendente", "resolvida", "arquivada"];

function ultimoTexto(c: ConversaMini): string {
  const m = c.mensagens[c.mensagens.length - 1];
  return m?.texto ?? "Sem mensagens";
}

export function AtendimentoClient({
  conversas,
  canWrite,
}: {
  conversas: ConversaMini[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [selecionadaId, setSelecionadaId] = useState<string | null>(conversas[0]?.id ?? null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selecionada = useMemo(
    () => conversas.find((c) => c.id === selecionadaId) ?? null,
    [conversas, selecionadaId],
  );

  function handleHandoff() {
    if (!selecionada) return;
    setErro(null);
    startTransition(async () => {
      const res = await alternarHandoff(selecionada!.id, !selecionada!.handoff_humano);
      if (!res.ok) return setErro(res.error);
      router.refresh();
    });
  }

  function handleStatus(novo: ConversaStatus) {
    if (!selecionada) return;
    setErro(null);
    startTransition(async () => {
      const res = await mudarStatusConversa(selecionada!.id, novo);
      if (!res.ok) return setErro(res.error);
      router.refresh();
    });
  }

  function handleEnviar() {
    if (!selecionada) return;
    const conteudo = texto.trim();
    if (!conteudo) return;
    setErro(null);
    startTransition(async () => {
      const res = await enviarMensagem(selecionada!.id, conteudo);
      if (!res.ok) return setErro(res.error);
      setTexto("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Lista de conversas */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <ul className="divide-y divide-border">
          {conversas.map((c) => {
            const meta = STATUS_META[c.status];
            const ativa = c.id === selecionadaId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelecionadaId(c.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors",
                    ativa ? "bg-primary/10" : "hover:bg-secondary/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{telBR(c.telefone)}</span>
                    {c.handoff_humano && <Badge variant="accent">Humano</Badge>}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">{ultimoTexto(c)}</span>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Thread selecionada */}
      <div className="rounded-2xl border border-border bg-card flex flex-col min-h-[28rem]">
        {!selecionada ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<MessagesSquare />}
              title="Selecione uma conversa"
              description="Escolha uma conversa na lista para ver o histórico e responder."
            />
          </div>
        ) : (
          <>
            {/* Cabeçalho da thread */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="space-y-0.5">
                <p className="font-medium">{telBR(selecionada.telefone)}</p>
                <p className="text-xs text-muted-foreground">
                  {selecionada.mensagens.length} mensagem(ns)
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={selecionada.handoff_humano ? "outline" : "accent"}
                    disabled={pending}
                    onClick={handleHandoff}
                  >
                    {selecionada.handoff_humano ? (
                      <><Bot /> Devolver ao bot</>
                    ) : (
                      <><UserCheck /> Assumir</>
                    )}
                  </Button>
                  <Select
                    className="h-9 w-40 text-xs"
                    value={selecionada.status}
                    disabled={pending}
                    onChange={(e) => handleStatus(e.target.value as ConversaStatus)}
                    aria-label="Status da conversa"
                  >
                    {STATUS_OPCOES.map((s) => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            {/* Bolhas */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selecionada.mensagens.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem mensagens ainda.</p>
              ) : (
                selecionada.mensagens.map((m, i) => {
                  const cliente = m.de === "cliente";
                  return (
                    <div key={i} className={cn("flex", cliente ? "justify-start" : "justify-end")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                          cliente && "bg-secondary text-secondary-foreground",
                          m.de === "bot" && "bg-primary/10 text-foreground",
                          m.de === "humano" && "bg-accent/15 text-accent-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {m.de === "cliente" ? "Cliente" : m.de === "bot" ? "Bot" : "Humano"} · {dataHoraBR(m.em)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            {canWrite && (
              <div className="border-t border-border p-4">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleEnviar();
                  }}
                >
                  <Input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escreva uma resposta…"
                    disabled={pending}
                  />
                  <Button type="submit" disabled={pending || !texto.trim()}>
                    <Send /> Enviar
                  </Button>
                </form>
                {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
