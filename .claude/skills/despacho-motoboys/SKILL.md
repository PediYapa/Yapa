---
name: despacho-motoboys
description: >
  Operar o leilão de corridas dos motoboys via grupos de WhatsApp (P/E), cadastrar
  pilotos e grupos, e usar o /despacho como fallback manual. Carregar ao gerenciar
  entregas, frota ou diagnosticar por que uma corrida não foi aceita/atribuída.
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Despacho de Motoboys (leilão via grupos de WhatsApp)

> ⚠️ A tabela `entregadores` foi **removida** (migration 014). A fonte da verdade da
> frota é `yapa.motoboys` (telefone UNIQUE = amarração do webhook Z-API). **Não recriar
> o modelo antigo.** Spec completa: `docs/specs/dispatch-motoboys.md`.

## Como funciona a via principal (autônoma)
1. Pedido confirmado (pago online OU dinheiro) → `lib/despacho.ts` dispara em paralelo:
   comanda → distribuidora E corrida → grupo de motoboys (`distribuidoras.grupo_motoboys_id`).
2. A mensagem no grupo tem `numero_corrida`, distância e valor do frete — **sem dados
   pessoais do cliente** (privacidade: nome/telefone/PIN só no DM do vencedor).
3. Primeiro motoboy que responde `P <numero>` ganha (claim atômico — UPDATE condicional
   em `handleMensagemGrupoMotoboys`, `grupo-motoboys.ts`). Perdedor recebe DM discreto.
4. `E <numero> <código>` (só o atribuído, com o código certo) marca entregue + notifica
   o cliente. O código (4 dígitos, `pedidos.codigo_validacao`) só o CLIENTE recebe por
   WhatsApp no despacho — o motoboy pede na porta; prova que chegou lá.
5. Estado em `pedidos.status_entrega`: `aguardando_motoboy → atribuido → em_rota → entregue`
   (NULL = pedido fora do dispatch). Frete separado em `pedidos.taxa_entrega_gs`.

## Cadastro
- **Motoboy**: SQL direto em `yapa.motoboys` via MCP (skill `onboarding-frota`, Parte B) —
  nome, telefone (formato Z-API, só dígitos, o MESMO número que ele usa no grupo — senão
  o "P" não é reconhecido), distribuidora, ativo. **Atenção:** o painel `/motoboys` NÃO é
  mais CRUD — desde jul/2026 é espelho somente-leitura dos entregadores da Entregas
  Expressas (agregado de `yapa.entregas`), não mexe em `yapa.motoboys`.
- **Grupo**: painel **/distribuidoras → editar → "Grupo de motoboys (ID Z-API)"**. Para
  obter o ID: mandar mensagem no grupo e copiar o campo `phone` do log
  `[yapa:grupo-payload]` (Vercel → runtime logs). Onboarding em lote: skill `onboarding-frota`.

## Fallback manual (/despacho)
Quando ninguém aceita a corrida no grupo: painel **/despacho** atribui um motoboy à
entrega e avança `aguardando → coletado → em_entrega → entregue`. Textos das mensagens
do leilão: `src/lib/mensagens-motoboys.ts` (copy centralizada).

## Diagnóstico rápido
- Corrida não anunciada no grupo → `grupo_motoboys_id` vazio na distribuidora, ou falha
  de envio (ver runtime logs por `[yapa:despacho]`).
- "P" ignorado → motoboy não cadastrado/inativo/telefone divergente ou de outro hub
  (log `[yapa:grupo] motoboy não habilitado`).
- Mensagem de grupo caindo no fluxo de cliente → checar detecção `isGroup`/`participantPhone`
  no início do webhook (formato Z-API pode variar por versão).

## Fase 2/3 (futuro)
`rotas` e `gps_pings` já referenciam `motoboys` — base para despacho automático por
proximidade (`lib/intel/roteamento.ts`, Haversine) quando houver GPS próprio.
