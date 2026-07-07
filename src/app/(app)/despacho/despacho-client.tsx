"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import type { EntregaStatus, MotoboyRow } from "@/lib/database.types";
import { atribuirMotoboy, mudarStatusEntrega } from "@/app/actions/despacho";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type MotoboyMini = Pick<MotoboyRow, "id" | "nome" | "telefone" | "ativo">;

/** Próximo passo do fluxo feliz a partir do status atual. */
const PROXIMO: Partial<Record<EntregaStatus, { alvo: EntregaStatus; label: string }>> = {
  aguardando: { alvo: "coletado", label: "Coletar" },
  coletado: { alvo: "em_entrega", label: "Sair p/ entrega" },
  em_entrega: { alvo: "entregue", label: "Confirmar entrega" },
};

const FINAIS: EntregaStatus[] = ["entregue", "cancelada"];

export function DespachoClient({
  entregaId,
  status,
  motoboyId,
  motoboys,
}: {
  entregaId: string;
  status: EntregaStatus;
  motoboyId: string | null;
  motoboys: MotoboyMini[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function atribuir(novoId: string) {
    setErro(null);
    startTransition(async () => {
      const res = await atribuirMotoboy(entregaId, novoId || null);
      if (!res.ok) return setErro(res.error);
      router.refresh();
    });
  }

  function avancar(novo: EntregaStatus) {
    setErro(null);
    startTransition(async () => {
      const res = await mudarStatusEntrega(entregaId, novo);
      if (!res.ok) return setErro(res.error);
      router.refresh();
    });
  }

  const proximo = PROXIMO[status];
  const encerrada = FINAIS.includes(status);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="h-9 w-44 text-xs"
          value={motoboyId ?? ""}
          disabled={pending || encerrada}
          onChange={(e) => atribuir(e.target.value)}
          aria-label="Atribuir motoboy"
        >
          <option value="">Sem motoboy</option>
          {motoboys.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.ativo}>
              {m.nome}
              {m.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </Select>

        {proximo && (
          <Button
            size="sm"
            variant="accent"
            disabled={pending}
            onClick={() => avancar(proximo.alvo)}
          >
            <Check /> {proximo.label}
          </Button>
        )}

        {!encerrada && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            disabled={pending}
            onClick={() => avancar("cancelada")}
          >
            <X /> Cancelar
          </Button>
        )}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
