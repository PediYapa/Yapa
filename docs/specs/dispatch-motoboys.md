# Spec: Dispatch de Motoboys via Grupos de WhatsApp

> ⚠️ **Mecanismo de despacho descontinuado** em favor de
> `docs/specs/entregas-expressas-open-delivery.md` — este documento descreve o
> modelo ANTERIOR (leilão via grupo WhatsApp), mantido como referência histórica.
> Na prática, o anúncio de corrida pro grupo (`msgCorridaGrupo`) não é mais chamado
> em nenhum lugar do código atual, e nada mais popula `pedidos.status_entrega`. O
> único conceito que sobrevive no despacho atual é a "prova de posse via código de
> confirmação" (`pedidos.codigo_validacao`). Ver seção "Telas defasadas" em
> `docs/specs/SDD-MASTER.md` para o estado exato de cada peça órfã.

## Objetivo
Ao confirmar um pedido (pago online ou dinheiro na entrega), notificar simultaneamente a distribuidora e o grupo de WhatsApp de motoboys do hub; o primeiro que responder `P <numero>` reivindica a corrida de forma atômica. Frete calculado por distância, contabilizado separado dos produtos.

## Usuário alvo
Motoboy (via grupo de WhatsApp, sem login) + admin Yapa (cadastro e acompanhamento).

## Fluxo principal

### Frete (no funil do bot, logo após o PIN)
1. `match_distribuidora` atribui o hub → Haversine cliente↔hub (`lib/frete.ts`, reusa `haversineKm` de `lib/intel/roteamento.ts`)
2. Faixas: até 2 km → Ƨ 10.000 · 2–5 km → Ƨ 15.000 · 5–8 km → Ƨ 20.000 · > 8 km → `null` (trata como fora de cobertura, reseta sessão)
3. `taxa_entrega_gs` + `distancia_km` salvos no contexto e depois no pedido
4. Resumo do checkout com três linhas: Subtotal, Entrega (X,X km), Total somado
5. Pagamento online cobra produtos + frete; `valor_total_gs` continua só produtos

### Duplo disparo na confirmação (`lib/despacho.ts`)
- Gatilhos: webhook dLocal (PAID), Server Action de aprovação, ou bot com forma "dinheiro"
- `Promise.allSettled`: comanda → distribuidora **E** corrida → grupo (`notificarGrupoMotoboys` em `zapi.ts`, sem sanitizar o ID do grupo)
- Falha em um disparo não bloqueia o outro; ok se pelo menos um chegou
- Mensagem do grupo SEM nome/telefone/PIN do cliente (privacidade)
- Cliente só recebe "pagamento confirmado" quando NÃO é dinheiro

### Claim atômico (webhook, `grupo-motoboys.ts`)
1. Branch no início do handler: `isGroup`/`participantPhone`/sufixo `-group`/`@g.us` → nunca entra no engine do cliente
2. Grupo casado com `distribuidoras.grupo_motoboys_id` (comparação tolerante a formato)
3. `P <n>` → lookup motoboy por `participantPhone` (ativo + distribuidora do grupo) → UPDATE condicional único (`motoboy_id IS NULL AND status_entrega = 'aguardando_motoboy'` + RETURNING)
4. Ganhou → grupo: "✅ Corrida #N é do Fulano" + DM com dados completos (endereço, cliente, telefone, PIN maps, valor a cobrar se dinheiro)
5. Perdeu → DM discreto ("já foi aceita"); número inexistente → silêncio
6. `E <n> <código>` → só o motoboy atribuído E com o código correto: `status_entrega/status = 'entregue'` + notifica o cliente. Código incorreto → DM pedindo para confirmar de novo (só se a corrida é dele). `E <n>` sem código → DM lembrando do código (só se a corrida é dele; senão silêncio).
7. Qualquer outra mensagem do grupo → ignorada em silêncio

### Código de confirmação de entrega (prova de que o motoboy chegou)
- Reusa `pedidos.codigo_validacao` (4 dígitos, já existia no schema para outro uso manual).
- Gerado (se ainda não existir) e enviado ao **cliente** por WhatsApp em `dispararOrdemDistribuidora` — sempre, independente da forma de pagamento.
- O motoboy nunca recebe o código pelo sistema — só o cliente sabe; o motoboy pede na porta. É isso que torna o `E` uma prova de entrega, não só a palavra do motoboy.
- Painel: botão "Regenerar código" em `/pedidos/[id]` agora também reenvia por WhatsApp (útil se o cliente perdeu a mensagem).

## Banco de dados (migration 013)
- `distribuidoras.grupo_motoboys_id` (text — phone/ID do grupo na Z-API)
- `yapa.motoboys` (org_id, distribuidora_id, nome, telefone UNIQUE, ativo) + RLS `motoboys_all_same_org`
- `pedidos`: `taxa_entrega_gs`, `distancia_km`, `motoboy_id`, `status_entrega` (aguardando_motoboy | atribuido | em_rota | entregue), `numero_corrida serial`
- Backfill: pedidos pré-feature ficam com `status_entrega = NULL` (não reivindicáveis)

## Integrações
- Z-API `send-text` para grupo (ID cru, sem `replace(/\D/g)`) e DMs 1:1
- Textos centralizados em `src/lib/mensagens-motoboys.ts`

## Painel admin
- `/motoboys` — CRUD (módulo `motoboys` em permissions + nav)
- Distribuidoras: campo "Grupo de motoboys (ID Z-API)" com hint
- Pedidos: colunas Entrega (badge + nome do motoboy) e Frete; detalhe com corrida/motoboy/frete

## Critérios de aceite
- [x] Migration idempotente aplicada (013 via MCP)
- [x] Resumo pós-PIN com subtotal + frete por faixa + total
- [x] `taxa_entrega_gs`/`distancia_km` separados de `valor_total_gs`
- [x] Duplo disparo paralelo (allSettled) — falha não bloqueia
- [x] Grupo sem dados pessoais do cliente
- [x] Claim atômico validado em SQL (2º claim = 0 linhas; E de outro motoboy bloqueado)
- [x] Vencedor DM completo / perdedor DM discreto / grupo só o anúncio
- [x] Mensagens ≠ P/E ignoradas em silêncio
- [x] `E <n> <código>` marca entregue + notifica cliente
- [x] Motoboy não cadastrado/inativo não reivindica
- [x] Código de entrega: cliente recebe automaticamente no despacho; motoboy nunca recebe pelo sistema
- [x] Código errado ou ausente → motoboy é avisado (DM) para tentar de novo; não confirma a entrega
- [x] `npm run typecheck` limpo

## Fora do escopo
- Rodízio/fila justa; GPS; repasse do frete no sistema; timeout/republicação; gateway novo

## Pendências de validação em produção
- Confirmar formato real do payload de grupo da Z-API (log `[yapa:grupo-payload]` já instrumentado) — campos `phone`/`participantPhone`/`isGroup` variam de versão
