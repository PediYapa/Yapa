import { Building2, ArrowLeftRight, MessageCircle, Plug } from "lucide-react";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { gs } from "@/lib/format";
import { taxaBrlParaGs } from "@/lib/intel/cambio";
import { zapiConfigurado, type ZapiConfig } from "@/lib/integrations/zapi";
import { gatewayStatus } from "@/lib/pagamentos/gateway";
import type { OrgRow } from "@/lib/database.types";
import { OrgForm, ZapiForm, CambioForm } from "./configuracoes-client";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const { supabase, profile } = await guard("configuracoes", "read");
  const { data } = await supabase.from("orgs").select("*").limit(1).maybeSingle();
  const org = data as OrgRow | null;

  const taxa = taxaBrlParaGs(org?.taxa_cambio_brl_gs);
  const canWrite = can(profile, "configuracoes", "write");

  // Credenciais Z-API: banco tem precedência sobre env vars
  const zapiDbCfg: ZapiConfig | null =
    org?.zapi_instance && org?.zapi_token
      ? { instance: org.zapi_instance, token: org.zapi_token, clientToken: org.zapi_client_token }
      : null;
  const zapiOk = zapiConfigurado(zapiDbCfg);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://seu-dominio.vercel.app";

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
                <OrgForm orgId={org.id} nome={org.nome} canWrite={canWrite} />
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
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="size-4" /> Câmbio Oficial da Manhã
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-display text-2xl font-semibold tabular-nums">1 BRL = {gs(taxa)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Taxa de conversão para Guarani usada em pagamentos Pix/BRL e checkouts DLocal.
              </p>
            </div>
            {org
              ? <CambioForm orgId={org.id} taxa={org.taxa_cambio_brl_gs ?? taxa} canWrite={canWrite} />
              : <p className="text-sm text-muted-foreground">Operação não encontrada.</p>
            }
          </CardContent>
        </Card>
      </div>

      {org && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-4" />
              Z-API (WhatsApp)
              <span className={`ml-auto text-xs font-normal px-2 py-0.5 rounded-full border ${zapiOk ? "border-success/25 bg-success/10 text-success" : "border-warning/30 bg-warning/15 text-warning-foreground"}`}>
                {zapiOk ? "Conectado" : "Pendente"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ZapiForm
              data={{
                orgId: org.id,
                instance: org.zapi_instance,
                token: org.zapi_token,
                clientToken: org.zapi_client_token,
                webhookSecret: org.zapi_webhook_secret,
                webhookUrl: appUrl,
              }}
              canWrite={canWrite}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="size-4" /> Outras integrações</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {([
              gatewayStatus(),
              { nome: "OpenAI (atendimento)", ok: !!process.env.OPENAI_API_KEY },
            ] as const).map((i) => (
              <li key={i.nome} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">{i.nome}</span>
                <Badge variant={i.ok ? "success" : "warning"}>{i.ok ? "Conectado" : "Pendente"}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Configurar via variáveis de ambiente no painel Vercel. Gateway de pagamento: ver docs/specs/gateway-pagamento.md (a contratar — dLocal não aprovada).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
