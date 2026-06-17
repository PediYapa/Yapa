import { Building2, ArrowLeftRight, Plug } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { gs } from "@/lib/format";
import { taxaBrlParaGs } from "@/lib/intel/cambio";
import { zapiConfigurado } from "@/lib/integrations/zapi";
import { dlocalConfigurado } from "@/lib/integrations/dlocal";
import type { OrgRow } from "@/lib/database.types";
import { ConfiguracoesClient } from "./configuracoes-client";

export const dynamic = "force-dynamic";

function statusBadge(conectado: boolean) {
  return conectado
    ? <Badge variant="success">Conectado</Badge>
    : <Badge variant="warning">Pendente</Badge>;
}

export default async function ConfiguracoesPage() {
  const { supabase, profile } = await guard("configuracoes", "read");
  const { data } = await supabase.from("orgs").select("*").limit(1).maybeSingle();
  const org = data as OrgRow | null;

  const taxa = taxaBrlParaGs();
  const canWrite = can(profile, "configuracoes", "write");

  const integracoes = [
    { nome: "Z-API (WhatsApp)", ok: zapiConfigurado() },
    { nome: "DLocal (pagamentos)", ok: dlocalConfigurado() },
    { nome: "OpenAI (atendimento)", ok: !!process.env.OPENAI_API_KEY },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Dados da operação, câmbio e integrações." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> Operação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {org ? (
              <>
                <ConfiguracoesClient orgId={org.id} nome={org.nome} canWrite={canWrite} />
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Cidade</dt>
                    <dd className="font-medium">{org.cidade ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">País</dt>
                    <dd className="font-medium">{org.pais ?? "—"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Operação não encontrada.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ArrowLeftRight className="size-4" /> Câmbio atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold tabular-nums">1 BRL = {gs(taxa)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Taxa de conversão para Guarani usada em pagamentos em Pix/BRL.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="size-4" /> Integrações</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {integracoes.map((i) => (
              <li key={i.nome} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">{i.nome}</span>
                {statusBadge(i.ok)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
