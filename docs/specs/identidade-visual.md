# Spec: Identidade Visual PediYapa

## Objetivo
Aplicar a identidade real da marca (Amarelo Yapa + preto) em todo o sistema, substituindo o esquema de cores anterior (violeta/uva).

## Referência de marca
- Logo: "PediYapa" bold/black, `#FFCC00` sobre fundo preto — ou preto sobre fundo amarelo
- Tagline: "Bebidas a un toque"
- Ícone: abridor de garrafa + tampinha

## Tokens de cor

| Token | Valor | Uso |
|-------|-------|-----|
| `--primary` | `oklch(0.88 0.19 97)` = `#FFCC00` | Botões, links, badges primários |
| `--primary-foreground` | `oklch(0.13 0 0)` = preto | Texto sobre amarelo |
| `--chart-1` | mesmo amarelo | Linha principal nos gráficos |

## Landing page (`/`)
- Header: fundo `neutral-950`, logo "PediYapa" em `#FFCC00`
- Hero: fundo `#FFCC00` 100%, texto preto bold, CTA preto com texto amarelo
- Seções: alternância dark (`neutral-950` / `neutral-900`)
- CTA de fechar: volta ao amarelo

## Login (`/login`)
- Painel esquerdo: fundo `#FFCC00`, texto preto — logo, copy, rodapé
- Painel direito: fundo `neutral-950`, formulário

## Dashboard interno (`/dashboard` e módulos)
- Preserva dark mode via cookie `yapa_theme=dark`
- Botões primários agora amarelos com texto preto (cascata automática de `--primary`)

## Portal Hub (`/hub`)
- 100% dark (`neutral-950` base)
- Acentos, borders hover e inputs focus em `#FFCC00`
- Sem mudança de tema (sempre dark — uso em balcão)

## Critérios de aceite
- [x] `--primary` = Amarelo Yapa em `globals.css` (light + dark)
- [x] Landing page com hero amarelo
- [x] Login com painel esquerdo amarelo
- [x] Nenhum elemento violeta/uva visível em produção
