# Yapa — Delivery de Bebidas · Ciudad del Este (PY)

Plataforma de gestão completa: bot WhatsApp → pedido → distribuidora → entregador → pagamento.

**Status:** produção em `yapa-iota.vercel.app`

---

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase · Vercel · Z-API · DLocal · OpenAI

---

## Módulos

| Módulo | O que faz |
|--------|-----------|
| Dashboard | Métricas do dia em tempo real |
| Atendimento | Conversas WhatsApp + handoff humano |
| Fluxos | Builder visual do bot (React Flow) |
| Pedidos | Criação manual + acompanhamento |
| Despacho | Rotear pedido → distribuidora → entregador |
| Clientes | Histórico de pedidos por telefone |
| Distribuidoras | Cadastro com raio de atuação e geolocalização |
| Entregadores | Cadastro + distribuidora base |
| Catálogo | Produtos com preço em GS e imagem |
| Financeiro | Saldos, repasses D+1 |
| Relatórios | Exportação e análise |
| Usuários | RBAC: owner / gerente / operador |
| Configurações | Z-API, DLocal, OpenAI |

---

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher credenciais
npm run dev                  # http://localhost:3000
```

---

## Banco de dados

Aplicar nesta ordem no Supabase SQL Editor:

```
db/schema.sql   → tabelas, enums, triggers
db/rls.sql      → Row Level Security
db/seed.sql     → dados de demo
```

Após aplicar: **Settings → API → Exposed schemas** → adicionar `yapa`.

---

## Integrações

| Serviço | Endpoint | Variáveis |
|---------|---------|-----------|
| Z-API | `POST /api/webhooks/whatsapp?secret=...` | `ZAPI_INSTANCE`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` |
| DLocal | `POST /api/webhooks/pagamento` | `DLOCAL_*` |
| OpenAI | — | `OPENAI_API_KEY` |
| Supabase | — | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

---

## Bot WhatsApp — como funciona

```
Cliente → "oi"
  └→ Webhook /api/webhooks/whatsapp
       └→ fluxo-engine.ts  (puro, sem I/O)
            ├→ nó texto/imagem  → envia mensagem → próximo nó
            ├→ nó botões        → envia botões → aguarda clique
            ├→ nó produto       → monta lista (1-3 botões / 4-12 enquete / 13+ texto)
            ├→ nó humano        → handoff → operador assume no app
            └→ fim              → estado limpo
```

**Estado de navegação:** salvo em `conversas.fluxo_estado` (JSONB).
**Carrinho:** salvo em `sessoes_whatsapp.carrinho`.

Para resetar um cliente: `UPDATE yapa.conversas SET fluxo_estado = NULL WHERE telefone = '595...'`

---

## Como especificar uma nova funcionalidade (SDD)

Antes de qualquer código novo, crie uma spec em `docs/specs/<slug>.md`:

```markdown
# Spec: <nome>

## Objetivo
Uma frase: o que o usuário consegue fazer que não conseguia antes.

## Usuário alvo
cliente WhatsApp / operador / entregador / owner

## Fluxo principal
1. ...

## Telas / UI
- Páginas afetadas
- Novos campos / estados visuais

## Banco de dados
- Novas tabelas ou colunas?
- Migrações?

## Integrações
- Z-API: novo envio ou recebimento?
- DLocal / OpenAI?

## Critérios de aceite
- [ ] ...

## Fora do escopo
- ...
```

**Processo:** Thales descreve → Claude escreve a spec → Thales aprova → Claude implementa.

---

## Scripts

| Comando | O quê |
|---------|-------|
| `npm run dev` | desenvolvimento |
| `npm run build` | build de produção |
| `npm run typecheck` | checagem de tipos |
| `npm run lint` | ESLint |

---

## Deploy

Repositório conectado à Vercel. Merge em `main` → deploy automático.
Credenciais de CI/CD: apenas `Pedi Yapa` (`admin@pediyapa.com`).
