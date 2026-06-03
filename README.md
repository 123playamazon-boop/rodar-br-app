# Rodar BR — Sistema do Aluno (MVP)

App web com **login** e **dados salvos na nuvem** para o aluno aprender a rodar oferta no BR.
Tem duas telas: **Guia passo a passo** (10 etapas) e **Dashboard** (ROI, lucro, CPA, vendas e métricas da VSL/VTurb).

É um site **estático** (HTML/CSS/JS) + **Supabase** (login e banco). Não tem etapa de build — sobe direto no GitHub + Vercel.

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página (login + app) |
| `styles.css` | Visual |
| `app.js` | Toda a lógica (login, guia, dashboard, sincronização) |
| `config.js` | **Você preenche** com as chaves do Supabase |
| `schema.sql` | O banco (rode no Supabase) |
| `vercel.json` | Config do Vercel |

> Sem preencher o `config.js`, o app abre em **modo local** (funciona, mas salva só no navegador). Bom para testar.

---

## Testar agora (modo local)

Abra o `index.html` no navegador. Vai entrar direto, sem login, em modo local. Tudo funciona; os dados ficam só nesse navegador.

---

## Publicar de verdade — 3 etapas

### 1) Criar o banco (Supabase) — grátis
1. Crie conta em **https://supabase.com** e clique em **New project**.
2. Quando o projeto subir, vá em **SQL Editor → New query**, cole **todo o conteúdo do `schema.sql`** e clique **Run**.
3. Vá em **Project Settings → API** e copie dois valores:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public** (a chave pública — pode ficar no front-end)
4. (Opcional) Em **Authentication → Providers → Email**, deixe ligado. Para o aluno entrar sem confirmar e-mail, desligue "Confirm email".
5. Cole os dois valores no **`config.js`**:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://abcd1234.supabase.co",
     SUPABASE_ANON_KEY: "cole_aqui_a_anon_key"
   };
   ```

### 2) Subir no GitHub
1. Crie um repositório novo em **https://github.com/new**.
2. Suba **todos os arquivos desta pasta** (botão *Add file → Upload files*, arraste tudo, *Commit*).

### 3) Publicar no Vercel
1. Entre em **https://vercel.com** com a sua conta do GitHub.
2. **Add New → Project → Import** o repositório.
3. Em *Framework Preset* escolha **Other** (é site estático, sem build). Clique **Deploy**.
4. Pronto: o Vercel te dá um link `https://seu-app.vercel.app`. Esse é o link que o aluno acessa.

> Atualizou algum arquivo? Suba a alteração no GitHub e o Vercel publica sozinho.

---

## Como o login funciona
- O aluno cria conta com **e-mail e senha** na própria tela.
- Os dados (progresso do guia + dashboard) ficam na **conta dele**, sincronizados em qualquer aparelho.
- Cada aluno só enxerga os próprios dados (regra de segurança no `schema.sql`).

## Próximas fases (depois deste MVP)
- **Dados automáticos:** conectar Meta Ads (API), VTurb e o tracker para o dashboard puxar gasto, vendas e métricas da VSL sozinho.
- **Deploy automático da VSL:** o Claude gera a página e publica (GitHub → Vercel) com o domínio ligado.
- **Multi-aluno / turmas:** painel do professor com o progresso de cada aluno.
