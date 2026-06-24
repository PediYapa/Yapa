# CLAUDE.md — Yapa

> Guia operacional do Claude Code neste repositório.
> Sistema **em produção** em `yapa-iota.vercel.app`. Thales é o dono do produto.

---

## 1. O que é o Yapa

Plataforma de gestão de delivery de bebidas em **Ciudad del Este (PY)**.

Fluxo central: cliente manda "oi" no WhatsApp → bot conversa via fluxo visual → pedido formado → roteado para distribuidora → despachado ao entregador → pagamento (GS/Pix) → entregue.

Tudo gerido pelo app interno: pedidos, atendimento, distribuidoras, entregadores, catálogo, financeiro, fluxos do bot.

---

## 2. Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 App Router, React 19, TypeScript estrito |
| Estilo | Tailwind v4 |
| Banco | Supabase (Postgres + Auth + RLS), schema `yapa`, via `@supabase/ssr` |
| Deploy | Vercel (produção: `yapa-iota.vercel.app`) |
| Gráficos | recharts |
| Ícones | lucide-react |
| Validação | zod + react-hook-form |
| **Bot WhatsApp** | **Z-API** (não-oficial) |
| Pagamentos | DLocal (GS/Pix) |
| IA | OpenAI (fallback de intenção quando sem fluxo ativo) |

---

## 3. Arquitetura

### Superfícies
- **UI interna** — Server Components + Server Actions (`src/app/actions/`), sessão Supabase + RLS.
- **API pública** — `/api/v1/*`, Bearer token (`requireToken`), consumida por bot/Make.
- **Webhooks** — `/api/webhooks/whatsapp` (Z-API inbound) e `/api/webhooks/pagamento` (DLocal).

### Auth
Supabase Auth + `src/middleware.ts`. RBAC: `user_profiles.role` (`owner|gerente|operador`) + `module_permissions` (jsonb). Função `can()` em `lib/auth/permissions.ts`.

### RLS
Isolamento por `org_id` — `db/rls.sql`. Toda tabela tem `org_id` + soft-delete (`deleted_at`). Política macro `{tabela}_all_same_org` cobre CRUD; controle fino fica nos Server Actions.

### Núcleo determinístico
`src/lib/intel/` — puro, sem I/O, testável: `fluxo-engine.ts`, `fluxo-entidades.ts`, `sessao-whatsapp.ts`, `cambio.ts`, roteamento geo.

---

## 4. Estrutura de pastas

```
db/
  schema.sql     ← fonte da verdade do banco
  rls.sql        ← Row Level Security
  seed.sql       ← dados de demo

src/
  middleware.ts
  app/(app)/<modulo>/          ← 1 pasta por módulo (page.tsx + *-client.tsx)
  app/actions/<modulo>.ts      ← Server Actions por módulo
  app/api/v1/<recurso>/        ← API pública Bearer token
  app/api/webhooks/{whatsapp,pagamento}/
  lib/
    supabase/{server,admin,client}.ts
    auth/{guard,permissions,session}.ts
    intel/                     ← motor do bot (puro)
    integrations/{zapi,openai,dlocal}.ts
    database.types.ts
    format.ts                  ← gs(), brl(), dataBR(), telBR()
  components/{ui,layout}/
```

---

## 5. Convenções (seguir SEMPRE)

1. **Módulo isolado:** cada módulo = pasta em `app/(app)/<modulo>/` + `app/actions/<modulo>.ts`. Não editar arquivos de outro módulo sem necessidade.
2. **Server Actions:** `"use server"` → `guard(modulo, "write")` → `safeParse` zod (nunca `parse` — erros ficam visíveis na UI) → mutação → `revalidatePath`.
3. **Leituras:** Server Components com `guard(modulo, "read")`, sempre `.is("deleted_at", null)`.
4. **org_id:** nunca do input — sempre de `profile.org_id` (UI) ou do token (API).
5. **Dinheiro:** tudo em **Guarani (GS)** internamente; Pix converte via `lib/intel/cambio.ts`; formatação via `lib/format.ts`.
6. **Segredos:** service-role só servidor (`lib/supabase/admin.ts`). `.env*` nunca commitado.
7. **Idioma:** pt-BR em toda a UI.
8. **Validação:** usar `safeParse` + `{ ok: false, error: parsed.error.issues[0]?.message }` — nunca `parse` que lança exceção genérica.

---

## 6. Conhecimento crítico do Z-API (bugs já corrigidos, não regredir)

### Webhook inbound
O Z-API envia `type: "ReceivedCallback"` para **qualquer** mensagem — inclusive botões e votos. Detectar pelo **conteúdo do body**, não pelo `type`:

| Tipo de resposta | Campo no body | Chaves corretas |
|-----------------|--------------|----------------|
| Botão clicado | `body.buttonsResponseMessage` | `.buttonId` (ID) + `.message` (label) |
| Voto de enquete | `body.pollVote` | `.options[0].name` (texto escolhido) |
| Texto livre | `body.text.message` ou `body.message` | — |

### Envio de mensagens
| Endpoint Z-API | Payload correto |
|---------------|----------------|
| `send-text` | `{ phone, message }` |
| `send-button-list` | `{ phone, message, buttonList: { buttons: [{id, label}] } }` |
| `send-poll` | `{ phone, message, poll: [{name}], pollMaxOptions: 1 }` |
| `send-image` | `{ phone, image, caption? }` |

**Atenção:** IDs de botão devem ter ≤ 20 caracteres (WhatsApp trunca). Usar `btn-${uuid.split('-')[0]}` (~12 chars).

### Estado do bot (fonte de verdade)
- **`conversas.fluxo_estado`** é o estado de navegação do fluxo — lido e escrito pelo webhook.
- **`sessoes_whatsapp`** guarda apenas o carrinho. NÃO é fonte de estado para o engine.
- Para resetar um cliente manualmente: `UPDATE yapa.conversas SET fluxo_estado = NULL WHERE telefone = '...'`.
- Palavras de reinício automático: "oi", "olá", "menu", "reiniciar", "comecar" — o engine ignora `fluxo_estado` e começa do nó de início.

### Limites WhatsApp (via Z-API)
| Itens na lista | Modo de envio |
|---------------|--------------|
| 1–3 | Botões interativos (`send-button-list`) |
| 4–12 | Enquete nativa (`send-poll`) |
| 13+ | Texto numerado (fallback) |

---

## 7. Fluxo de Especificação (SDD — antes de qualquer código novo)

**Toda funcionalidade nova começa por uma spec.** Só abre código depois que a spec estiver aprovada.

### Template de spec (criar em `docs/specs/<slug>.md`)

```markdown
# Spec: <nome da funcionalidade>

## Objetivo
Uma frase: o que o usuário consegue fazer que não conseguia antes.

## Usuário alvo
Quem usa: cliente WhatsApp / operador Yapa / entregador / owner.

## Fluxo principal (passo a passo)
1. ...
2. ...
3. ...

## Fluxo alternativo / erros
- Se X → bot faz Y
- Se campo vazio → mensagem "..."

## Telas / UI
- Quais páginas são afetadas?
- Novos campos no formulário?
- Novos estados visuais (badge, tabela, modal)?

## Banco de dados
- Novas tabelas? Novas colunas? Migrações necessárias?
- Impacto no RLS?

## Integrações externas
- Z-API: novo tipo de mensagem enviada ou recebida?
- DLocal: novo evento de pagamento?
- OpenAI: novo prompt?

## Critérios de aceite (como saber que está pronto)
- [ ] ...
- [ ] ...

## O que NÃO faz (escopo negativo)
- ...
```

### Processo
1. **Thales descreve** o que quer em linguagem natural.
2. **Claude cria a spec** no template acima e apresenta para revisão.
3. **Thales aprova ou ajusta** a spec.
4. **Só então** Claude escreve o código — seguindo a spec linha a linha.
5. Critérios de aceite são verificados antes de commitar.

---

## 8. Regras de segurança e deploy (BLOQUEIO ABSOLUTO)

- **Git/GitHub/Vercel:** usar SOMENTE o usuário `Pedi Yapa` (`admin@pediyapa.com`). Nunca 'Aurum Clinic' ou qualquer outra conta.
- **Commits:** sempre com `Co-Authored-By: Pedi Yapa <admin@pediyapa.com>`.
- **Push para `main`:** requer autorização explícita do Thales na conversa corrente.
- **Mudanças estruturais no banco** (`schema.sql`, `rls.sql`): pausar e apresentar o diff para aprovação antes de aplicar.

---

## 9. Autonomia de execução

Thales autoriza execução direta (sem pedir confirmação) para:
- Criação de componentes React padrão, ajustes de Tailwind.
- Server Actions simples (CRUD), correções de bugs pontuais.
- Fixes de validação, mensagens de erro, formatação.

Pausar e pedir aprovação antes de:
- Mudanças em `db/schema.sql` ou `db/rls.sql`.
- Decisões arquiteturais com múltiplos caminhos (apresentar a spec primeiro).
- Qualquer push para produção.

---

## 10. Verificação antes de commitar

```bash
npm run typecheck   # deve passar (zero erros)
npm run build       # deve passar
```

Após mudanças de schema: rodar advisors de segurança no Supabase + testar acesso cross-org negado.
