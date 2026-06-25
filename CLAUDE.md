# CLAUDE.md — Yapa

> Guia operacional do Claude Code neste repositório.
> Produção: `www.pediyapa.com` (Vercel). Supabase: `ahhrhyuduhwkuegocjbb`. Thales é o dono.

---

## 1. O que é o Yapa

Plataforma de delivery de bebidas em **Ciudad del Este (PY)**.

**Jornada completa (validada em produção):**
Cliente manda "oi" → bot conversa (gate de idade → menu de categorias → produto → formato/sabor → quantidade → mais itens? → nome → PIN de localização) → distribuidora roteada por geo → resumo de checkout → handoff para atendente → despacho → entrega.

Gestão interna: pedidos, atendimento, distribuidoras, entregadores, catálogo, financeiro, fluxos do bot.

---

## 2. Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 App Router, React 19, TypeScript estrito |
| Estilo | Tailwind v4 |
| Banco | Supabase Postgres + Auth + RLS, schema `yapa`, via `@supabase/ssr` |
| MCP Supabase | Acesso direto ao banco via MCP (aplicar migrations, SQL, advisors) |
| Deploy | Vercel (`www.pediyapa.com`) — auto-deploy via GitHub; fallback: `npx vercel --prod` |
| Gráficos | recharts |
| Ícones | lucide-react |
| Validação | zod + react-hook-form |
| Bot WhatsApp | Z-API (não-oficial) |
| Pagamentos | DLocal (GS/Pix) |
| IA | OpenAI (fallback de intenção quando sem fluxo ativo) |
| Geo | PostGIS: extensões `cube` + `earthdistance`, RPC `yapa.match_distribuidora` |

---

## 3. Arquitetura

### Superfícies
- **UI interna** — Server Components + Server Actions (`src/app/actions/`), sessão Supabase + RLS.
- **Webhooks** — `/api/webhooks/whatsapp` (Z-API inbound), `/api/webhooks/pagamento` (DLocal).
- **API pública** — `/api/v1/*`, Bearer token (`requireToken`).

### Motor do bot (`src/lib/intel/`) — PURO, sem I/O, testável
| Arquivo | Responsabilidade |
|---------|-----------------|
| `fluxo-engine.ts` | Executa o grafo de nós; retorna envios, contexto_patch, adicionar_carrinho |
| `fluxo-entidades.ts` | Consulta banco e monta listas de produto/hub/entregador |
| `sessao-whatsapp.ts` | Persistência do carrinho em `sessoes_whatsapp` |
| `cambio.ts` | Conversão GS/BRL |

### Funções puras exportadas do engine (não misturar com I/O)
- `executarFluxo(fluxo, estado, texto, resolveProduto, localizacao?)` → `ResultadoFluxo`
- `calcularSubtotal(precoUnit, precoCaixa, formato, quantidade)` → `number`
- `montarResumoCheckout(carrinho)` → `{ texto, total }`
- `tipoEntidadeDoNo(node)` → `EntidadeTipo | null`

### Auth
Supabase Auth + `src/middleware.ts`. RBAC: `user_profiles.role` (`owner|gerente|operador`) + `module_permissions` (jsonb). Função `can()` em `lib/auth/permissions.ts`.

### RLS
Isolamento por `org_id` — `db/rls.sql`. Política macro `{tabela}_all_same_org`. Controle fino nos Server Actions.

---

## 4. Estrutura de pastas

```
db/
  schema.sql           ← fonte de verdade do banco
  rls.sql              ← Row Level Security
  seed.sql             ← dados de demo
  migrations/
    001–008_*.sql      ← aplicadas em produção

src/
  middleware.ts
  app/(app)/<modulo>/          ← 1 pasta por módulo
  app/actions/<modulo>.ts      ← Server Actions por módulo
  app/api/webhooks/whatsapp/   ← motor do bot (webhook principal)
  lib/
    supabase/{server,admin,client}.ts
    auth/{guard,permissions,session}.ts
    intel/             ← motor puro do bot
    integrations/{zapi,openai,dlocal}.ts
    database.types.ts
    format.ts          ← gs(), brl(), dataBR(), telBR()
  components/{ui,layout}/

docs/specs/            ← specs SDD de cada funcionalidade
```

---

## 5. Convenções (seguir SEMPRE)

1. **Módulo isolado:** cada módulo = pasta `app/(app)/<modulo>/` + `app/actions/<modulo>.ts`.
2. **Server Actions:** `"use server"` → `guard(modulo, "write")` → `safeParse` zod → mutação → `revalidatePath`. **Nunca `parse`** — oculta o erro real.
3. **Leituras:** Server Components + `guard(modulo, "read")`, sempre `.is("deleted_at", null)` + `.limit(1)` em buscas por unicidade.
4. **org_id:** nunca do input — sempre `profile.org_id` (UI) ou token (API).
5. **Dinheiro:** tudo em **Guarani (GS)**; Pix converte via `cambio.ts`; formatar via `format.ts`.
6. **Segredos:** service-role só em `lib/supabase/admin.ts`. `.env*` nunca commitado.
7. **Idioma:** pt-BR em toda a UI.
8. **Migrations:** usar `mcp__claude_ai_Supabase__apply_migration` (DDL) e `execute_sql` (DML/queries). Sempre testar antes de aplicar.
9. **Deploy:** GitHub push → Vercel auto-deploy. Se não disparar: `npx vercel --prod` na raiz do projeto.

---

## 6. Conhecimento crítico do Z-API

### Tipos de mensagem recebida (detectar pelo CAMPO, não pelo `type`)

| Mensagem | Campo no body | Chaves corretas |
|----------|--------------|----------------|
| Botão clicado | `body.buttonsResponseMessage` | `.buttonId` (ID) + `.message` (label) |
| Voto de enquete | `body.pollVote` | `.options[0].name` |
| Localização (PIN) | `body.location` | `.latitude`, `.longitude`, `.address` |
| Texto livre | `body.text` (objeto) | `.text.message` ou `body.message` |

O Z-API sempre envia `type: "ReceivedCallback"` — **nunca use o type como discriminador**.

### Envio de mensagens

| Endpoint | Payload |
|----------|---------|
| `send-text` | `{ phone, message }` |
| `send-button-list` | `{ phone, message, buttonList: { buttons: [{id, label}] } }` — máx. 3 botões |
| `send-poll` | `{ phone, message, poll: [{name}], pollMaxOptions: 1 }` — máx. 12 opções |
| `send-image` | `{ phone, image, caption? }` |

**Regra automática do webhook:** `botoes.length > 3` → envia como `send-poll` com fallback texto numerado se poll falhar.

**IDs de botão:** ≤ 20 chars (WhatsApp trunca). Usar `btn-${uuid.split('-')[0]}` (~12 chars).

---

## 7. Motor do bot — estado e fluxo de dados

### Fonte de verdade do estado
- **`conversas.fluxo_estado`** (JSONB) — posição no fluxo + contexto intermediário:
  ```json
  {
    "fluxo_id": "...",
    "no_atual": "f-menu",
    "atualizado_em": "...",
    "contexto": {
      "item_pendente": { "produto_id": "...", "nome": "Pod Black Sheep", "preco_gs": 90000, "preco_caixa": null },
      "formato": "Caixa",
      "aguardando_sabor": true,
      "distribuidora_id": "...",
      "latitude": -25.52,
      "longitude": -54.61,
      "nome": "Thales"
    }
  }
  ```
- **`sessoes_whatsapp.carrinho`** — array de `CarrinhoItem` acumulado:
  ```json
  [{ "produto_id": "...", "nome": "Michelob - Caixa", "formato": "Caixa", "quantidade": 2, "preco": 5000, "subtotal": 56400 }]
  ```

### Palavras de reinício automático
"oi", "olá", "menu", "reiniciar", "comecar", "hey", "hi" — engine ignora `fluxo_estado` e começa do nó de início.

### Reset manual no banco
```sql
UPDATE yapa.conversas SET fluxo_estado = NULL WHERE telefone = '595...';
DELETE FROM yapa.sessoes_whatsapp WHERE telefone = '595...';
```

### Tipos de nó do builder (React Flow)

| Tipo | Comportamento |
|------|--------------|
| `inicio` | Entrada, não emite |
| `texto` | Emite e avança |
| `imagem` | Emite e avança |
| `botoes` | Emite e **pausa** (aguarda clique). Com `salvar_em_contexto`: salva label no contexto e usa aresta do botão ou padrão |
| `produto` | Entidade dinâmica: pausa, webhook lista do banco filtrado por `categoria`. Com `pede_quantidade: true`: guarda em `item_pendente` em vez de adicionar direto ao carrinho |
| `captura` | Pausa e aguarda texto livre. `variavel="quantidade"` finaliza o carrinho com subtotal |
| `location_capture` | Pausa e aguarda PIN ou endereço digitado |
| `humano` | Aciona handoff e encerra fluxo |

### Funil dinâmico de sabor (pods)
Quando produto tem `opcoes_variacao`, o webhook injeta etapa virtual via `contexto.aguardando_sabor = true`. O sabor concatena ao nome: `"Pod Black Sheep - menta"`. Depois retoma a captura de quantidade.

### Matemática do carrinho
`calcularSubtotal(precoUnit, precoCaixa, formato, qtd)`:
- `formato === "Caixa"` e `precoCaixa > 0` → `precoCaixa × qtd`
- Caso contrário → `precoUnit × qtd`

---

## 8. Geo-routing

RPC `yapa.match_distribuidora(user_lat, user_lng)`:
- Usa `earthdistance` (extensões `cube` + `earthdistance` ativas no Supabase).
- Reutiliza coluna `yapa.distribuidoras.raio_km`.
- Retorna `uuid` da distribuidora mais próxima cujo raio cobre o ponto, ou `null` se fora de cobertura.
- Fallback: bot informa cliente que está fora da área e permanece no nó aguardando novo PIN.
- Migration: `db/migrations/008_geo_match_distribuidora.sql`.

---

## 9. Categorias de produto

| Valor no banco | Label na UI | Campos extras |
|---------------|------------|--------------|
| `cerveja` | Cerveja | `preco_caixa`, `unidades_por_caixa` |
| `destilado` | Destilado | — |
| `pod` | Pod / Cigarro Eletrônico | `opcoes_variacao` (sabores) |
| `conveniencia` | Conveniência | — |
| `combo` | Combo Promocional | — |
| `vape` | **DESCONTINUADO** (dormente no enum) | — |

---

## 10. Fluxo SDD (antes de qualquer código novo)

**Toda funcionalidade começa por uma spec em `docs/specs/<slug>.md`.**

### Bússola de Intenção (como o Thales descreve)
Descreva o **o quê** e o **problema**, não o como. O Claude decide a implementação mais eficiente.

### Template mínimo
```markdown
# Spec: <nome>

## Objetivo (1 frase)

## Usuário alvo

## Fluxo principal (passo a passo)

## Banco de dados (novas colunas/tabelas?)

## Integrações (Z-API, DLocal, geo, OpenAI?)

## Critérios de aceite
- [ ] ...

## Fora do escopo
```

### Processo
1. Thales descreve em linguagem natural (bússola de intenção).
2. Claude escreve a spec + apresenta para revisão.
3. Thales aprova.
4. Claude implementa seguindo a spec.
5. Typecheck + build + teste antes de commitar.

---

## 11. Regras de segurança e deploy (BLOQUEIO ABSOLUTO)

- **Git/GitHub/Vercel:** SOMENTE o usuário `Pedi Yapa` (`admin@pediyapa.com`). Nunca 'Aurum Clinic'.
- **Commits:** sempre com `Co-Authored-By: Pedi Yapa <admin@pediyapa.com>`.
- **Push para `main`:** requer autorização explícita do Thales na conversa corrente.
- **DDL no banco (`schema.sql`, `rls.sql`):** pausar e apresentar diff para aprovação.
- **Migrations via MCP:** usar `apply_migration` para DDL, `execute_sql` para DML/queries.

---

## 12. Autonomia de execução

**Executar diretamente (sem confirmar):**
- Componentes React, ajustes de Tailwind, Server Actions CRUD, fixes de validação.
- Correções de bug pontuais identificadas nos logs.
- Aplicar o fluxo corretamente no banco via MCP quando o import do builder falha.

**Pausar e pedir aprovação:**
- Mudanças em `db/schema.sql` ou `db/rls.sql`.
- Decisões arquiteturais com múltiplos caminhos.
- Push para produção.

---

## 13. Verificação antes de commitar

```bash
npm run typecheck   # zero erros
npm run build       # deve passar
```

Após DDL: `mcp__claude_ai_Supabase__get_advisors` (security + performance).

---

## 14. Migrations aplicadas em produção

| # | Arquivo | O que faz |
|---|---------|-----------|
| 001 | `001_add_zapi_config_and_rls_fix.sql` | Config Z-API nas orgs + fix RLS |
| 002 | `002_add_taxa_cambio_brl_gs.sql` | Taxa de câmbio BRL/GS |
| 003 | `003_add_gateway_fields_pedidos.sql` | Campos de gateway em pedidos |
| 004 | `004_create_contatos.sql` | Tabela de contatos |
| 005 | `005_create_sessoes_whatsapp.sql` | Sessões e carrinho do bot |
| 006 | `006_produtos_caixa_variacao.sql` | `preco_caixa`, `unidades_por_caixa`, `opcoes_variacao` em produtos |
| 007 | `007_rename_produto_categorias.sql` | `voucher→conveniencia`, `outro→combo` |
| 008 | `008_geo_match_distribuidora.sql` | Extensões geo + RPC `match_distribuidora` |
