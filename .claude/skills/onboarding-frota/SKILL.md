---
name: onboarding-frota
description: >
  Cadastrar a frota de motoboys em lote (lista colada do WhatsApp → inserts) e
  vincular o grupo de WhatsApp de cada hub (grupo_motoboys_id) capturando o ID
  real dos logs. Carregar no onboarding dos 30–40 pilotos ou ao trocar/adicionar
  grupos de corrida.
allowed-tools: [Read, Bash, Grep, Glob]
---

# Onboarding da Frota (motoboys + grupos)

Transforma a tarde de digitação em 2 mensagens: Thales cola a lista, o Claude valida
e insere em lote via MCP Supabase.

## Parte A — Vincular o grupo de cada hub
1. Pedir ao Thales para mandar **qualquer mensagem** no grupo de motoboys do hub
   (pelo WhatsApp conectado à Z-API).
2. Buscar o ID real nos runtime logs da Vercel via MCP: filtrar `yapa:grupo-payload`
   → copiar o campo `phone` EXATAMENTE como veio (tem sufixo não numérico, ex.:
   `1203630...-group` — nunca sanitizar).
   - Conferir também o formato de `participantPhone` no mesmo log (varia por versão
     da Z-API); se divergir do esperado pelo código, ajustar a detecção no webhook.
3. Gravar via MCP `execute_sql`:
   ```sql
   UPDATE yapa.distribuidoras SET grupo_motoboys_id = '<phone_do_log>' WHERE nome = '<hub>';
   ```
   (ou pelo painel /distribuidoras → editar → "Grupo de motoboys").

## Parte B — Cadastrar motoboys em lote
1. Pedir a lista no formato livre (uma linha por piloto): `Nome, telefone, hub`.
2. Normalizar cada telefone: **só dígitos, formato Z-API** (`5959XXXXXXXX`); tem que ser
   o MESMO número que o piloto usa no grupo, senão o comando "P" não o reconhece.
   Validar: começa com 595, 11–12 dígitos, sem duplicados na lista.
3. Resolver `distribuidora_id` pelo nome do hub; org_id da org única.
4. Inserir em lote (idempotente por telefone UNIQUE):
   ```sql
   INSERT INTO yapa.motoboys (org_id, distribuidora_id, nome, telefone)
   VALUES (...), (...)
   ON CONFLICT (telefone) DO UPDATE SET nome = EXCLUDED.nome,
     distribuidora_id = EXCLUDED.distribuidora_id, ativo = true;
   ```
5. Devolver ao Thales a tabela final (nome, telefone, hub) + linhas rejeitadas com motivo.

## Parte C — Validar o leilão (1 corrida de teste por grupo)
Com a skill `testar-bot`: criar pedido sintético no hub → conferir anúncio no grupo →
um piloto real responde `P <n>` → conferir claim + DM. Depois limpar os dados de teste.

## Regras
- Telefone é a chave de amarração do webhook — errar 1 dígito = piloto invisível.
- Motoboy desligado: `ativo = false` (não deletar se já tem corridas — FK em pedidos).
- Privacidade: nunca colar dados de cliente no grupo durante testes.
