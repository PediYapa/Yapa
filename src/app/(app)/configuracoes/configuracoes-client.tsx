"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { salvarOrg } from "@/app/actions/configuracoes";
import type { ActionResult } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>;
}

export function ConfiguracoesClient({
  orgId,
  nome,
  canWrite,
}: {
  orgId: string;
  nome: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarOrg, undefined);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={orgId} />
      <div className="space-y-2 max-w-sm">
        <Label htmlFor="nome">Nome da operação</Label>
        <Input id="nome" name="nome" defaultValue={nome} required disabled={!canWrite} />
      </div>
      {state && (state.ok
        ? <p className="text-sm text-success">Salvo com sucesso.</p>
        : <p className="text-sm text-destructive">{state.error}</p>)}
      {canWrite && (
        <div>
          <SubmitButton />
        </div>
      )}
    </form>
  );
}
