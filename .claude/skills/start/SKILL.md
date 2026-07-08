---
name: start
description: >
  Configuração inicial do ambiente Yapa. Roda uma vez para criar contas, configurar
  Supabase/Vercel, preencher .env, aplicar o banco, conectar Z-API/OpenAI/gateway de
  pagamento e testar o login. Carregar ao abrir o projeto pela primeira vez ou ao reconfigurar.
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, WebFetch]
---

# Start — Configuração e Primeiro Uso do Yapa

Você é o assistente de setup do **Yapa** (plataforma de gestão do delivery em Ciudad
del Este). Guie o Thales, passo a passo, do zero até o app rodando — sem pular etapas
e confirmando cada uma antes de seguir. Tom direto e prático.

## Regra de segurança (inegociável)
Nunca exiba nem invente credenciais. Todas as chaves são do Thales — oriente como
obter e onde colar (`.env.local`, nunca commitado).

## Passo 1 — Visão geral
Explique o que será configurado: GitHub, Supabase (banco+auth), Vercel (deploy),
Z-API (WhatsApp), OpenAI (agente) e o gateway de pagamento (a contratar — ver
`docs/specs/gateway-pagamento.md`). Mostre o `DEPLOY.md` como roteiro.
⚠️ Projeto Supabase canônico: `ahhrhyuduhwkuegocjbb` — qualquer outro na conta é órfão.

## Passo 2 — Dependências e build
```bash
npm install
npm run typecheck   # deve passar
npm run build       # deve passar
```

## Passo 3 — Supabase
1. Criar projeto em supabase.com (login GitHub, grátis).
2. SQL Editor → rodar na ordem: `db/schema.sql`, `db/rls.sql`, **todas as
   `db/migrations/0XX_*.sql` em ordem numérica** (o schema.sql é só a base histórica),
   e por fim `db/seed.sql`.
3. Settings → API → Exposed schemas → adicionar `yapa`.
4. Authentication → criar usuário; vincular o perfil owner (ver topo de `db/seed.sql`).
5. Copiar URL + anon key + service_role key para `.env.local` (copie de `.env.example`).

## Passo 4 — Rodar local
```bash
npm run dev
```
Abrir http://localhost:3000/login e entrar. Validar: Dashboard com dados do seed,
Pedidos, Despacho, Financeiro (controle D+1), Atendimento.

## Passo 5 — Deploy Vercel
Seguir `DEPLOY.md` (importar repo, variáveis de ambiente, deploy).

## Passo 6 — Integrações
- Z-API: conectar número, apontar webhook de mensagens → `/api/webhooks/whatsapp?secret=<ZAPI_WEBHOOK_SECRET>`.
- Gateway de pagamento: **nenhum ativo ainda** (dLocal não aprovada). Quando contratar
  (Dinelco/Asaas/...), seguir o checklist de `docs/specs/gateway-pagamento.md` — a
  notificação do gateway aponta para `/api/webhooks/<slug>` (dLocal: `/api/webhooks/dlocal`).
  Sem gateway, o bot opera 100% com dinheiro na entrega.
- OpenAI: `OPENAI_API_KEY` no `.env`.

## Passo 7 — Dados reais
Substituir o seed pela tabela real de distribuidoras (com raio + link do Maps) usando
a skill `/onboarding-distribuidor`, e cadastrar o catálogo no módulo Catálogo.

## Checklist final
- [ ] build/typecheck verdes
- [ ] Supabase aplicado + schema exposto + owner vinculado
- [ ] login funcionando
- [ ] deploy Vercel verde
- [ ] webhook Z-API apontado (gateway de pagamento: quando contratado)
- [ ] distribuidoras reais cadastradas (com grupo de motoboys — skill `despacho-motoboys`)
