# SDD Master — Yapa Engine

> Documento vivo. Atualizar após cada ciclo de desenvolvimento.
> Última atualização: 2026-06-25 · Engine V2 em produção.

---

## Estado atual do sistema (produção validada)

### Funil conversacional completo (9 passos)

```
1. "oi"         → Boas-vindas
2. Gate de idade → [Sim] → Menu | [Não] → Encerra
3. Menu (5 categorias) → enquete WhatsApp (>3 opções auto-vira poll)
4. Lista de produtos da categoria → poll/botões filtrado do banco
5. Variação:
     Cerveja → "Caixa ou Unidade?" (salvar_em_contexto="formato")
     Pod     → "Qual sabor?" (funil dinâmico via opcoes_variacao)
     Demais  → pula direto p/ quantidade
6. Captura de quantidade → subtotal calculado → item no carrinho
7. "Adicionar mais?" → [Sim] loop p/ menu | [Não] → avança
8. Captura do nome
9. PIN de localização → geo-routing → distribuidora atribuída
     → Resumo de checkout enviado (itens + total em GS)
     → Handoff para atendente
```

### O que está funcionando em produção
- [x] Loop de carrinho (múltiplos itens, sem zerar entre voltas)
- [x] Funil dinâmico de sabor (Pod Black Sheep → morango/menta/banana)
- [x] Matemática de caixa (Caixa usa `preco_caixa`, Unidade usa `preco_gs`)
- [x] PIN de localização → `match_distribuidora` → distribuidora atribuída
- [x] Fallback fora de cobertura (permanece no nó aguardando novo PIN)
- [x] Resumo de checkout com total somado e distribuidora
- [x] Menu de 5 categorias como enquete (>3 opções)
- [x] Filtro de catálogo por categoria no nó `produto`
- [x] Reinício automático com "oi", "menu" etc.
- [x] Conversas não duplicam (`.limit(1)` na busca)
- [x] Fluxo corrigível diretamente no banco via SQL (sem depender do builder)

---

## Categorias de produto (estrutura atual)

```
cerveja      → preco_gs (unidade) + preco_caixa + unidades_por_caixa
destilado    → preco_gs
pod          → preco_gs + opcoes_variacao (sabores)
conveniencia → preco_gs
combo        → preco_gs
vape         → DESCONTINUADO (dorme no enum, invisível no app)
```

---

## Proximos incrementos (backlog ordenado por valor)

### P1 — Criação real do pedido no banco
**Problema:** o carrinho acumula em `sessoes_whatsapp` e o resumo vai via WhatsApp, mas **nenhum registro em `yapa.pedidos` ou `yapa.pedido_itens` é criado**.
**O que falta:** na etapa de checkout (após distribuidora atribuída), inserir `pedido` + `pedido_itens` + `entrega` e limpar o carrinho da sessão.
**Complexidade:** média. Sem nova UI necessária (pedido aparece automaticamente em `/pedidos`).

### P2 — Pagamento Pix via DLocal
**Problema:** `send-poll`/botões não têm botão de pagamento integrado. O nó `payment_dlocal` já existe no builder mas não está conectado ao checkout.
**O que falta:** após confirmar o pedido, gerar link DLocal e enviar via `enviarLinkPagamento`. Webhook `/api/webhooks/pagamento` já existe.
**Complexidade:** média.

### P3 — Notificação da distribuidora
**Problema:** a distribuidora não é avisada quando recebe um pedido.
**O que falta:** ao criar o pedido (`P1`), enviar mensagem no grupo WhatsApp da distribuidora via Z-API usando `notificarDistribuidora(distribuidora.telefone, resumo)`.
**Complexidade:** baixa (função já existe em `zapi.ts`).

### P4 — Sabor do pod no builder visual
**Problema:** o funil de sabor funciona via lógica interna (flag `opcoes_variacao` do produto), mas **não aparece como nó** no builder React Flow. O operador não consegue ver o fluxo visualmente completo.
**O que falta:** nó visual "seleção de sabor" ou exibir a etapa virtual no canvas quando o produto tem sabores.
**Complexidade:** baixa/média.

### P5 — Validação de cobertura antes do pedido
**Problema:** o cliente só descobre que está fora da cobertura ao enviar o PIN (passo 9). Poderia ser mais cedo.
**O que falta:** perguntar o bairro/zona no início do funil e pré-validar antes de aceitar o pedido.
**Complexidade:** média.

### P6 — Resumo de checkout rico (imagens)
**Problema:** o resumo é só texto. Com imagem por produto seria mais visual.
**O que falta:** antes do texto de resumo, enviar `send-image` de cada produto do carrinho.
**Complexidade:** baixa (função `enviarImagem` já existe).

---

## Arquitetura do banco (estado atual)

### Tabelas principais
```sql
yapa.conversas        → histórico de mensagens + fluxo_estado (JSONB, fonte de verdade do engine)
yapa.sessoes_whatsapp → carrinho do cliente (CarrinhoItem[])
yapa.fluxos           → nós e arestas do fluxo ativo (JSONB)
yapa.produtos         → catálogo com preco_caixa, opcoes_variacao
yapa.distribuidoras   → com latitude, longitude, raio_km
yapa.pedidos          → (a ser populado pelo P1)
```

### Funções/RPCs
```sql
yapa.match_distribuidora(user_lat float8, user_lng float8) → uuid
-- Retorna distribuidora mais próxima cujo raio_km cobre o ponto. NULL se fora.
```

### Contexto do fluxo (`conversas.fluxo_estado.contexto`)
| Chave | Quando existe | Valor |
|-------|--------------|-------|
| `item_pendente` | Após selecionar produto com `pede_quantidade` | `{ produto_id, nome, nome_base, preco_gs, preco_caixa }` |
| `aguardando_sabor` | Pod com sabores selecionado | `true` |
| `formato` | Botão "Caixa"/"Unidade" clicado | `"Caixa"` ou `"Unidade"` |
| `distribuidora_id` | PIN recebido e processado | UUID |
| `latitude` / `longitude` | PIN recebido | `float` |
| `endereco` | PIN ou texto digitado | `string` |
| `nome` | Passo de coleta do nome | `string` |

---

## Regras de negócio consolidadas

### Precificação
```
subtotal = formato === "Caixa" && preco_caixa > 0
  ? preco_caixa × quantidade
  : preco_gs × quantidade
```

### Roteamento de envio WhatsApp
```
botoes.length === 1–3  → send-button-list
botoes.length === 4–12 → send-poll (fallback: texto numerado se poll falhar)
entidade dinâmica      → montarListaEntidade → resolverModo → mesma regra acima
```

### Detecção de mensagem inbound Z-API
```
body.buttonsResponseMessage != null → botão clicado   → usa .buttonId + .message
body.pollVote != null               → voto de enquete → usa .options[0].name
body.location != null               → PIN de localização → usa .latitude/.longitude/.address
else                                → texto livre      → usa body.text.message ou body.message
```

---

## Template SDD para novos incrementos

```markdown
# Spec: <nome>

## Objetivo
Uma frase: o que o usuário consegue fazer que não conseguia antes.

## Usuário alvo
cliente WhatsApp / operador / entregador / owner

## Fluxo principal
1. ...

## Banco de dados
- Novas tabelas ou colunas?
- Migration necessária?

## Integrações
- Z-API (envio/recebimento novo)?
- DLocal / geo / OpenAI?

## Critérios de aceite
- [ ] ...

## Fora do escopo
- ...
```
