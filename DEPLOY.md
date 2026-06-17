# Deploy — Yapa

Passo a passo para colocar o Yapa no ar no **seu** ambiente (contas suas).

## 1. GitHub

1. Crie um repositório no seu GitHub (ex.: `yapa`).
2. Suba este projeto:
   ```bash
   git init && git add -A && git commit -m "Yapa — base do MVP"
   git branch -M main
   git remote add origin git@github.com:SEU_USUARIO/yapa.git
   git push -u origin main
   ```

## 2. Supabase (banco + auth)

1. Crie um projeto em https://supabase.com (login via GitHub — plano grátis).
2. No **SQL Editor**, rode na ordem: `db/schema.sql` → `db/rls.sql` → `db/seed.sql`.
3. **Settings → API → Exposed schemas**: adicione `yapa`.
4. **Authentication → Users**: crie seu usuário (e-mail + senha).
5. Vincule o perfil owner (SQL Editor):
   ```sql
   insert into yapa.user_profiles (id, org_id, nome, role)
   values ('<UUID_DO_USUARIO_AUTH>', '00000000-0000-0000-0000-0000000000a1', 'Thales', 'owner');
   ```
6. Copie de **Settings → API**: `Project URL`, `anon public key`, `service_role key`.

## 3. Vercel (deploy)

1. Acesse https://vercel.com (login via GitHub) e **Import** o repositório `yapa`.
2. Em **Environment Variables**, adicione (de `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` = a URL da Vercel (ex.: `https://yapa.vercel.app`)
   - `OPENAI_API_KEY`, `ZAPI_*`, `DLOCAL_*`, `CAMBIO_BRL_GS` (conforme for ativando)
3. **Deploy**. A cada `git push` na `main`, a Vercel publica sozinha.

## 4. Webhooks

- **Z-API**: aponte o webhook de mensagens recebidas para
  `https://SEU_DOMINIO/api/webhooks/whatsapp` (use `?secret=` se definir `ZAPI_WEBHOOK_SECRET`).
- **DLocal**: aponte a notificação de pagamento para
  `https://SEU_DOMINIO/api/webhooks/pagamento`.

## 5. Domínio (opcional)

Compre um domínio (ex.: `yapa.com`) e aponte na Vercel em **Settings → Domains**.

## Checklist

- [ ] Repo no GitHub
- [ ] Supabase: schema + rls + seed aplicados, schema `yapa` exposto
- [ ] Usuário owner criado e perfil vinculado
- [ ] Variáveis na Vercel + deploy verde
- [ ] Login funcionando (`/login`)
- [ ] Webhooks Z-API e DLocal apontados
