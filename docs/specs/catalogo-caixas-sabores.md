# Spec: Catálogo com Caixas e Sabores

## Objetivo
Suportar o mix real de produtos: cervejas vendidas por unidade OU caixa, e pods/vapes com variações de sabor — sem precisar mexer no banco de novo.

## Usuário alvo
Owner/gerente cadastrando produtos no painel; cliente final escolhendo no WhatsApp.

## Fluxo principal (painel)
1. Operador abre **Catálogo → Novo produto**.
2. Escolhe a categoria. O formulário se adapta:
   - **Cerveja:** aparecem "Preço da caixa" e "Unidades por caixa".
   - **Pod / Vape:** aparece o campo de **Sabores** (lista de tags).
   - **Demais (destilado, voucher, outro):** só preço unitário (como hoje).
3. Salva. Os campos extras vão para `preco_caixa`, `unidades_por_caixa`, `opcoes_variacao`.

## Fluxo principal (bot — preparação)
Quando o cliente escolhe um produto que tem `opcoes_variacao`, o motor deve pausar
e perguntar o sabor ANTES de pedir a quantidade. Esta spec deixa a estrutura
preparada (TODO no engine); a fiação completa com o webhook vem numa etapa seguinte.

## Banco de dados
Tabela `yapa.produtos`, 3 colunas novas (todas nullable):
- `preco_caixa numeric(14,2)` — preço da caixa fechada (cervejas).
- `unidades_por_caixa integer` — quantas unidades vêm na caixa.
- `opcoes_variacao text[]` — sabores/variações, ex.: `{Menta,Morango,Uva}`.

Migration idempotente: `db/migrations/006_produtos_caixa_variacao.sql` (ADD COLUMN IF NOT EXISTS).
Sem impacto em RLS (mesma tabela, mesma política `produtos_all_same_org`).

## Frontend
- `produtos-client.tsx`: categoria vira estado controlado → renderização condicional.
- Sabores: input de tags (digita "Menta, Morango" → vira chips removíveis).
- `actions/produtos.ts`: Zod aceita os 3 campos; sabores parseados de string para `text[]`.

## Integrações
- Nenhuma externa nesta etapa. O engine só ganha um rascunho da lógica de variação.

## Critérios de aceite
- [ ] Migration aplicada no Supabase sem erro.
- [ ] Cerveja: salva preço de caixa + unidades por caixa.
- [ ] Pod: salva lista de sabores e exibe como chips ao reabrir.
- [ ] Produto sem campos extras (destilado) continua salvando normal.
- [ ] `npm run typecheck` passa.

## Fora do escopo (próxima etapa)
- Fiação completa do nó de variação no webhook (perguntar sabor no WhatsApp).
- Cálculo automático de desconto caixa vs unidade.
- Categoria "Combo" no enum (combos hoje usam "outro" com preço único).
