---
name: criar-skill
description: >
  Criar uma nova skill para o ambiente Yapa. Carregar quando o Thales quiser
  automatizar algo do dia a dia (um relatório, um fluxo, uma rotina) e transformar
  isso numa skill reutilizável do Claude Code.
allowed-tools: [Read, Write, Edit, Bash, Glob]
---

# Criar Skill (Yapa)

Padrão para criar skills neste projeto. Uma skill = uma pasta em
`.claude/skills/<nome>/SKILL.md` com frontmatter YAML + instruções.

## Estrutura obrigatória
```markdown
---
name: <nome-kebab-case>
description: >
  Quando carregar esta skill (gatilhos claros) e o que ela faz. 1-3 linhas.
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Título

Instruções diretas, passo a passo, no contexto do Yapa (delivery em Ciudad del Este).
```

## Boas práticas
1. **Gatilho claro** no `description` — é o que faz a skill ser carregada na hora certa.
2. **Específica do negócio** — fale de pedidos, distribuidoras, entregadores, GS, Z-API.
3. **Reaproveite o que já existe** — `lib/intel/*` (lógica), `lib/integrations/*`
   (Z-API/DLocal/OpenAI), os módulos em `app/(app)/*`. Não duplique.
4. **Segurança** — nunca embuta credenciais; oriente o uso do `.env`.
5. **pt-BR** e tom prático.

## Passos
1. Pergunte: o que a skill resolve? Qual o gatilho? Que ferramentas usa?
2. Crie `.claude/skills/<nome>/SKILL.md` com a estrutura acima.
3. Teste: descreva uma situação real e veja se a skill conduz bem.
4. Se errar, **corrija o próprio SKILL.md** (skills se auto-corrigem).

## Ideias de skills para o Yapa
- `/fechar-caixa` — rotina de fechamento D+1 + resumo do dia.
- `/promo-copa` — gerar mensagens/ofertas de bebida para datas de jogos.
- `/repor-catalogo` — conferir disponibilidade e atualizar preços em GS.
