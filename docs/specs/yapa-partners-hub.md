# Spec: Yapa Partners — Portal de Estoque para Distribuidores

## Objetivo
Portal B2B em `/hub` para os ~15 distribuidores parceiros gerenciarem apenas a quantidade física de caixas no estoque, sem acesso a qualquer dado financeiro.

## Usuário alvo
Parceiro distribuidor (role `hub`) e admin Yapa em modo supervisão.

## Fluxo principal

### Parceiro hub
1. Login em `pediyapa.com/login` → middleware redireciona para `/hub/dashboard`
2. Vê tabela com produtos do seu estoque (nome + quantidade — sem preço)
3. Edita quantidade inline (onBlur → UPSERT silencioso)
4. Adiciona produto digitando nome sujo → motor WIP identifica e adiciona
5. Importa planilha CSV → motor WIP em lote + IA casa nomes → UPSERT

### Admin (modo supervisão)
1. Acessa `/dashboard` → card "Yapa Partners" → `/hub/dashboard`
2. Vê lista de todos os hubs → clica para entrar em modo supervisão (`?hub=<id>`)
3. Botão "← Trocar hub" para voltar à lista
4. Tem as mesmas ações do parceiro (editar, adicionar, importar)

## Banco de dados
- `estoque_hub` — N:M pivot (distribuidora × produto, só `quantidade`)
- `distribuidoras.tipo` — classificação do hub (ex.: "Premium")
- `user_profiles.distribuidora_id` — vínculo do usuário hub
- `user_profiles.role` — novo valor `hub` no enum `user_role`
- Migration 011 (estrutura) + Migration 012 (RLS admin read)

## RLS
- Parceiro hub: filtra por `current_distribuidora_id()` (só vê a própria distribuidora)
- Owner/gerente: vê qualquer distribuidora da org (cláusula OR na política)

## Motor WIP (`src/lib/hub/wip-matcher.ts`)
- Produto único: determinístico (token overlap ≥ 0.34) + OpenAI árbitro
- Lote CSV: **uma chamada** à IA para o lote inteiro, resposta index-aligned
- `parseQuantidade()`: converte strings sujas ("50 caixas", "1.200") → int
- Sem `@ai-sdk` — fetch nativo, `response_format: json_object`

## CSV Import (`/api/hub/import-csv`)
- `maxDuration = 60`, cap 500 linhas
- Parser nativo: detecta delimitador, keyword-based header detection
- UPSERT overwrite: CSV reflete contagem real (não acumula)

## Isolamento financeiro (dupla camada)
1. RLS em `estoque_hub` bloqueia acesso direto ao banco
2. UI nunca consulta `preco_gs` — só `id` e `nome` de produtos

## Critérios de aceite
- [x] Parceiro vê e edita apenas sua distribuidora
- [x] Admin vê todos os hubs e entra em modo supervisão
- [x] Nenhum campo de preço trafega para o client hub
- [x] WIP unitário: adicionar produto por texto livre
- [x] WIP lote: importar CSV (até 500 linhas) com IA
- [x] UPSERT overwrite (não acumula)
- [x] Botão "← Trocar hub" visível só para admin
- [x] Card de acesso rápido no dashboard principal

## Fora do escopo
- Histórico de alterações de estoque
- Notificações de estoque baixo (apenas alerta visual local)
- Dados financeiros de qualquer forma

## Como criar um novo parceiro
1. Supabase → Authentication → Add user (e-mail + senha)
2. SQL:
```sql
UPDATE yapa.user_profiles
SET role = 'hub', distribuidora_id = '<uuid_da_distribuidora>'
WHERE id = '<auth_user_uuid>';
```
