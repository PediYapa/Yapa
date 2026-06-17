# Yapa

Plataforma de gestão do delivery de bebidas em **Ciudad del Este (PY)** — pedidos
via WhatsApp, roteamento por geolocalização, despacho, pagamento multi-moeda
(Guarani/Pix via DLocal) e controle financeiro.

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Vercel.

## Módulos

Dashboard · Pedidos · Despacho · Atendimento · Clientes · Distribuidoras ·
Entregadores · Catálogo · Financeiro · Relatórios · Usuários · API Tokens · Configurações.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher com seu Supabase
npm run dev                  # http://localhost:3000
```

> Sem Supabase configurado o app sobe, mas as telas precisam do banco para exibir
> dados. Veja o passo de provisionamento abaixo.

## Banco de dados

Aplicar, nesta ordem, no seu projeto Supabase (SQL Editor ou MCP):

1. `db/schema.sql` — tabelas, enums, triggers.
2. `db/rls.sql` — Row Level Security (isolamento por org).
3. `db/seed.sql` — dados de demonstração de Ciudad del Este.

Depois, exponha o schema `yapa` em **Settings → API → Exposed schemas**, crie o
usuário owner no **Authentication** e vincule o perfil (instruções no topo de
`db/seed.sql`).

## Scripts

| Comando | O quê |
|---------|-------|
| `npm run dev` | desenvolvimento |
| `npm run build` | build de produção |
| `npm run typecheck` | checagem de tipos (tsc) |
| `npm run lint` | eslint |

## Integrações

| Serviço | Uso | Configuração |
|---------|-----|--------------|
| Z-API | WhatsApp (receber/enviar) | `.env` + webhook → `/api/webhooks/whatsapp` |
| DLocal | Pagamentos GS/Pix | `.env` + webhook → `/api/webhooks/pagamento` |
| OpenAI | Agente que interpreta pedidos | `.env` `OPENAI_API_KEY` |
| Make | Orquestração opcional do bot | `.env` `MAKE_WEBHOOK_URL` |

## Deploy

Ver `DEPLOY.md`. Resumo: conectar o repositório à Vercel, configurar as variáveis
de ambiente e fazer o deploy.
