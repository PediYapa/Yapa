---
name: ship
description: >
  Entregar mudança em produção com verificação de ponta a ponta: typecheck, build,
  commit com a identidade correta, push, poll do deploy na Vercel até READY e
  leitura de runtime logs. Carregar sempre que for commitar/deployar o Yapa.
allowed-tools: [Read, Bash, Grep, Glob]
---

# Ship — deploy verificado de ponta a ponta

Elimina os dois modos de falha históricos: "produção não refletiu" (webhook GitHub→Vercel
atrasa/não dispara) e bug que só aparece no primeiro uso real pós-deploy.

## Pré-requisito inegociável
Push para `main` **exige autorização explícita do Thales na conversa corrente** (CLAUDE.md §14).
Sem autorização: parar após o commit local e pedir.

## Pipeline (nesta ordem, sem pular)
1. **Gate local**
   ```bash
   cd "c:/pedi yapa app/yapa" && npm run typecheck && npm run build
   ```
   Erro de tipos citando rota deletada em `.next/types` → `Remove-Item -Recurse -Force .next` e rebuildar.
2. **Se a mudança tocou o bot/checkout/dispatch** → rodar skill `testar-bot` ANTES do push
   (funil sintético local ou em produção pós-deploy, conforme o caso).
3. **Commit** — identidade obrigatória `Pedi Yapa <admin@pediyapa.com>` (conferir
   `git config user.name/user.email`; commit de outra conta = deploy BLOCKED na Vercel).
   Rodapé: `Co-Authored-By: Pedi Yapa <admin@pediyapa.com>`.
4. **Push** `git push origin main`.
5. **Verificar o deploy DE VERDADE** (nunca assumir): MCP Vercel `list_deployments`
   (projectId `prj_bPe3dDSVSj4lAwvoTu9C121hsrNC`, teamId `team_QR7z8NIPC3FZ3sNkapejxiai`)
   até o deployment do SHA recém-pushado ficar `READY` em `production`.
   - Se nenhum deployment novo aparecer em ~2 min: webhook GitHub→Vercel falhou →
     fallback `npx vercel --prod` na raiz do projeto.
   - Se `ERROR`: `get_deployment_build_logs` e corrigir.
6. **Smoke pós-deploy** — `get_runtime_logs` (últimos minutos) filtrando `error`/`yapa:`;
   se a mudança expôs rota nova, 1 request de sanidade nela.
7. **Fechar o ciclo** — se houve migration nova: arquivo em `db/migrations/` já commitado
   (regra: aplicar via MCP e gravar o arquivo no MESMO turno) + `get_advisors` sem lint novo.

## Anti-padrões (proibidos)
- "Fiz push, deve estar no ar" sem poll do READY.
- Testar mandando o Thales abrir o WhatsApp — simular primeiro via `testar-bot`.
- Amend/force push em `main` (histórico compartilhado com a Vercel).
