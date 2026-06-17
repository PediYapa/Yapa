"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { salvarOrg, salvarZapi } from "@/app/actions/configuracoes";
import type { ActionResult } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? pendingLabel : label}</Button>;
}

export function OrgForm({
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
          <SubmitButton label="Salvar" pendingLabel="Salvando…" />
        </div>
      )}
    </form>
  );
}

export type ZapiFormData = {
  orgId: string;
  instance: string | null;
  token: string | null;
  clientToken: string | null;
  webhookSecret: string | null;
  webhookUrl: string;
};

export function ZapiForm({ data, canWrite }: { data: ZapiFormData; canWrite: boolean }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(salvarZapi, undefined);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={data.orgId} />

      <div className="space-y-2">
        <Label htmlFor="zapi_instance">Instance ID</Label>
        <Input
          id="zapi_instance"
          name="zapi_instance"
          defaultValue={data.instance ?? ""}
          placeholder="Ex.: 3D5A…"
          disabled={!canWrite}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">Painel Z-API → sua instância → Instance ID</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="zapi_token">Token</Label>
        <Input
          id="zapi_token"
          name="zapi_token"
          type="password"
          defaultValue={data.token ?? ""}
          placeholder="Token da instância"
          disabled={!canWrite}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="zapi_client_token">Client-Token <span className="text-muted-foreground font-normal">(opcional)</span></Label>
        <Input
          id="zapi_client_token"
          name="zapi_client_token"
          type="password"
          defaultValue={data.clientToken ?? ""}
          placeholder="Security Token da conta Z-API"
          disabled={!canWrite}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="zapi_webhook_secret">Webhook Secret <span className="text-muted-foreground font-normal">(opcional)</span></Label>
        <Input
          id="zapi_webhook_secret"
          name="zapi_webhook_secret"
          defaultValue={data.webhookSecret ?? ""}
          placeholder="Segredo para validar chamadas do Z-API"
          disabled={!canWrite}
          autoComplete="off"
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">URL do webhook para configurar no Z-API:</p>
        <code className="break-all">{data.webhookUrl}/api/webhooks/whatsapp{data.webhookSecret ? `?secret=<seu-secret>` : ""}</code>
      </div>

      {state && (state.ok
        ? <p className="text-sm text-success">Configuração salva com sucesso.</p>
        : <p className="text-sm text-destructive">{state.error}</p>)}

      {canWrite && (
        <div>
          <SubmitButton label="Salvar configuração Z-API" pendingLabel="Salvando…" />
        </div>
      )}
    </form>
  );
}

/** @deprecated Use OrgForm diretamente */
export function ConfiguracoesClient({
  orgId,
  nome,
  canWrite,
}: {
  orgId: string;
  nome: string;
  canWrite: boolean;
}) {
  return <OrgForm orgId={orgId} nome={nome} canWrite={canWrite} />;
}
