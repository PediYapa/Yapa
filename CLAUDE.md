# CLAUDE.md — Yapa

> Guia para o Claude Code operar neste repositório. Yapa é **seu** produto
> (Thales) — identidade própria, não segue marcas de terceiros.

## O que é

**Yapa** é a plataforma de gestão do delivery de bebidas em **Ciudad del Este (PY)**:
pedidos via WhatsApp, roteamento para a distribuidora mais próxima, despacho ao
entregador, pagamento multi-moeda e controle financeiro. Tudo é gerido aqui dentro
— clientes, pedidos, entregas, entregadores, distribuidoras, atendimento e financeiro.

- **Fase 1 (foco — Copa):** receber pedido → rotear distribuidora → despachar → validar entrega.
- **Fases 2/3 (estruturadas, sem UI):** central própria, GPS ponto-a-ponto, hubs e rotas.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estrito · Tailwind v4 · Supabase
(Postgres + Auth + RLS, schema `yapa`) via `@supabase/ssr` · recharts · lucide-react ·
zod · react-hook-form. Deploy na **Vercel**.

Integrações: **Z-API** (WhatsApp não-oficial) · **DLocal** (pagamentos GS/Pix) ·
**OpenAI** (agente de pedidos) · **Make** (orquestração opcional do bot).

## Arquitetura

- **Duas superfícies:** a UI interna usa **Server Actions** (`src/app/actions/`) +
  sessão Supabase + RLS. A API pública (`/api/v1/*`) usa **Bearer token**
  (`requireToken`) e é consumida pelo bot/Make. Os **webhooks** (`/api/webhooks/*`)
  recebem Z-API (mensagens) e DLocal (pagamentos).
- **Auth:** Supabase Auth + `src/middleware.ts` (gating). RBAC por
  `user_profiles.role` (`owner|gerente|operador`) + `module_permissions` (jsonb).
- **RLS:** isolamento por `org_id` (`db/rls.sql`). Toda tabela tem `org_id` e
  soft-delete (`deleted_at`).
- **Núcleo determinístico:** `src/lib/intel/` (roteamento por geolocalização,
  status, câmbio, métricas) — puro e testável, sem banco.

## Estrutura

```
db/{schema.sql,rls.sql,seed.sql}     ← fonte da verdade do banco (aplicar via Supabase)
src/
  middleware.ts
  app/(app)/<modulo>/                ← páginas autenticadas (1 pasta por módulo)
  app/actions/<modulo>.ts            ← Server Actions (mutações) por módulo
  app/api/v1/<recurso>/              ← API pública Bearer token (bot/Make)
  app/api/webhooks/{whatsapp,pagamento}/
  lib/{supabase,auth,intel,integrations}/ + cn.ts, format.ts, tokens.ts, database.types.ts
  components/{ui,layout}/
```

## Convenções (seguir SEMPRE)

1. **Ownership por módulo:** cada módulo é uma pasta isolada em `app/(app)/<modulo>/`
   + um arquivo `app/actions/<modulo>.ts`. Não editar arquivos de outro módulo.
2. **Server Actions** começam com `"use server"`, validam entrada com **zod**, chamam
   `guard(modulo, "write")` antes de mutar, e usam `revalidatePath` após.
3. **Leituras**: Server Components com `guard(modulo, "read")`; sempre `.is("deleted_at", null)`.
4. **org_id**: nunca confiar no input; vem de `profile.org_id` (UI) ou do token (API).
5. **Dinheiro/datas/telefone**: `lib/format.ts` (`gs`, `brl`, `valor`, `dataBR`, `telBR`).
   Tudo é normalizado em **Guarani (GS)**; Pix (BRL) converte via `lib/intel/cambio.ts`.
6. **Segredos**: service-role só no servidor (`lib/supabase/admin.ts`). `.env*` nunca commitado.
7. **pt-BR** em toda a UI.

## Banco (estado atual)

⚠️ O projeto Supabase **ainda não foi provisionado** (será na imersão).
`database.types.ts` está escrito à mão a partir de `db/schema.sql`. Ao provisionar:
1. Criar projeto Supabase (login via GitHub) e expor o schema `yapa` (Settings → API → Exposed schemas).
2. Aplicar `db/schema.sql`, depois `db/rls.sql`, depois `db/seed.sql`.
3. Criar o usuário owner no Supabase Auth e vincular o perfil (ver topo de `db/seed.sql`).
4. Regenerar `src/lib/database.types.ts` (`supabase gen types typescript --schema yapa`).
5. Preencher `.env.local` (ver `.env.example`).

## Verificação

- `npm run typecheck` e `npm run build` devem passar (já passam).
- Após mudanças de schema, rodar os *advisors* de segurança do Supabase.
- RLS: testar que acesso cross-org é negado.

## Próximos passos (imersão)

- Provisionar Supabase + Vercel no seu ambiente e fazer o deploy.
- Conectar Z-API (número WhatsApp) e apontar o webhook para `/api/webhooks/whatsapp`.
- Configurar DLocal e apontar o webhook para `/api/webhooks/pagamento`.
- Montar a tabela real de distribuidoras (com raio + link do Maps).
- Decidir o desenho de "quebra de pedido" (substituição/reprecificação).
8. **Controle de Versão e Deploy (REGRA DE BLOQUEIO):** Para qualquer operação no GitHub ou deploy na Vercel, utilize ESTRITAMENTE e unicamente o usuário `Pedi Yapa` (`admin@pediyapa.com`). É terminantemente proibido utilizar o usuário 'Aurum Clinic' ou qualquer outra credencial.
9. **Autonomia de Execução (Modo Rápido):** Você possui autorização prévia do Thales para auto-aprovar e executar diretamente trabalhos de rotina (criação de componentes React padrão, ajustes de Tailwind, Server Actions simples). Você só deve interromper o fluxo e solicitar a aprovação humana se a tarefa envolver: 
   - Mudanças estruturais críticas no banco de dados (`schema.sql` ou `rls.sql`).
   - Decisões arquiteturais que possuam múltiplos caminhos ou ferramentas possíveis.