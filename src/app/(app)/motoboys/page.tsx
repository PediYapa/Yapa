import { guard } from "@/lib/auth/guard";
import type { EntregaEventoExterno } from "@/lib/database.types";
import { MotoboysClient, type MotoboyEspelho } from "./motoboys-client";

export const dynamic = "force-dynamic";

/** Evento atual da entrega que conta como corrida concluída. */
const EVENTOS_CONCLUIDOS: EntregaEventoExterno[] = ["ORDER_DELIVERED", "DELIVERY_FINISHED"];
/** Eventos terminais — entrega fora desses estados = motoboy em corrida agora. */
const EVENTOS_ENCERRADOS: EntregaEventoExterno[] = [...EVENTOS_CONCLUIDOS, "CANCELLED", "REJECTED"];

export default async function MotoboysPage() {
  const { supabase } = await guard("motoboys", "read");

  // Espelho histórico: os motoboys são os deliveryPerson que já apareceram nas
  // entregas da Entregas Expressas — nada é cadastrado manualmente. Escopo de
  // org via RLS (sessão), como o resto do painel.
  const { data: entregasData } = await supabase
    .from("entregas")
    .select("entregador_provedor_id, entregador_nome, entregador_telefone, entregador_foto_url, evento_externo, evento_externo_em")
    .eq("provedor", "entregas_expressas")
    .not("entregador_provedor_id", "is", null)
    .order("evento_externo_em", { ascending: true, nullsFirst: true });

  // Agrupa pelo id ESTÁVEL da operadora — nome/telefone podem repetir ou vir
  // vazios em algum evento; como as linhas vêm em ordem cronológica, o último
  // valor não-nulo de cada campo vence (equivale ao MAX/última leitura).
  const porId = new Map<string, MotoboyEspelho>();
  for (const e of entregasData ?? []) {
    const id = e.entregador_provedor_id;
    if (!id) continue;
    let m = porId.get(id);
    if (!m) {
      m = {
        provedorId: id,
        nome: null,
        telefone: null,
        fotoUrl: null,
        corridasConcluidas: 0,
        ultimaAtividade: null,
        emCorridaAgora: false,
      };
      porId.set(id, m);
    }
    if (e.entregador_nome) m.nome = e.entregador_nome;
    if (e.entregador_telefone) m.telefone = e.entregador_telefone;
    if (e.entregador_foto_url) m.fotoUrl = e.entregador_foto_url;
    if (e.evento_externo && EVENTOS_CONCLUIDOS.includes(e.evento_externo)) m.corridasConcluidas += 1;
    if (e.evento_externo && !EVENTOS_ENCERRADOS.includes(e.evento_externo)) m.emCorridaAgora = true;
    if (e.evento_externo_em && (!m.ultimaAtividade || e.evento_externo_em > m.ultimaAtividade)) {
      m.ultimaAtividade = e.evento_externo_em;
    }
  }

  const motoboys = [...porId.values()].sort((a, b) =>
    (b.ultimaAtividade ?? "").localeCompare(a.ultimaAtividade ?? ""),
  );

  return <MotoboysClient motoboys={motoboys} />;
}
