<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b05c2536-3fd1-446a-ac58-00d492277835

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## Aplicativo web instalável (PWA)

O Bella Top também funciona como aplicativo: abra o link no celular ou tablet e use
**"Adicionar à tela inicial"** (Android/Chrome) ou **Compartilhar → Adicionar à Tela de Início** (iPhone/Safari).
Ele abre em tela cheia, com ícone próprio, e usa o mesmo servidor e o mesmo banco de dados do sistema.

- `public/manifest.webmanifest` — nome, cores e ícones do app
- `public/sw.js` — guarda só a "casca" do app; dados de produção (`/api`) vêm sempre ao vivo

## Publicar (deploy)

Precisa de Node 22 e das variáveis do `.env.example` (principalmente `GOOGLE_SERVICE_ACCOUNT_KEY` do Firebase).

- **Docker:** `docker build -t bella-top . && docker run -p 3000:3000 --env-file .env bella-top`
- **Render:** crie um Blueprint com o caminho `bella-top/render.yaml` (plano grátis, sem cartão) e preencha as chaves.
- **Manual:** `npm ci && npm run build && NODE_ENV=production npm start`

## Testes

- `npm test` — testes seguros, com banco simulado em memória (não precisam de chave e nunca tocam o Firebase real):
  regressão, sincronização, mídia e a simulação ponta a ponta de 50 OPs.
- `npm run test:sim` — só a simulação ponta a ponta (PDF → PCP → máquinas → expedição).
- `npm run test:live` — integração com Firestore/Storage/Drive **reais**; grava e apaga dados (Limpeza de Histórico).
  Fica bloqueada a menos que `BELLATOP_LIVE_TESTS=1`. Use só com um projeto Firebase de teste, nunca o da fábrica.

## Logins de teste

Cria um login por posto (PCP, Refile, Flexografia, Estamparia, Máquinas 2/3/4, Acabamento, Terceirizado e Expedição),
com senhas aleatórias, pela API do app publicado. Só precisa de um login de administrador:

```
BELLATOP_URL=https://seu-app.onrender.com ADMIN_USER=master ADMIN_PASS=suaSenha npm run users:test
```

- A lista sai no terminal e em `logins-teste.csv` (fora do Git). Rodar de novo renova as senhas.
- `npm run users:test -- --remover` desativa todos os logins `teste_*`.
- O script avisa se alguma conta antiga ainda aceita senha padrão (`admin123`/`123456`);
  `npm run users:test -- --trocar-senhas-padrao` troca essas senhas por aleatórias (salvas em `senhas-trocadas.csv`).
- O servidor não cria mais contas com senha fixa. No primeiro boot ele cria só o `master`, com senha temporária
  impressa uma vez no log. Contas de demonstração só com `BELLATOP_SEED_DEMO_USERS=1`.

## Modo de teste sem login

Com `BELLATOP_OPEN_ACCESS=1` (já definido no `render.yaml`), a tela de entrada mostra "MODO TESTE":
tocar numa máquina entra direto com um operador autorizado para ela (ou o administrador, se não houver),
e o card Administrador entra no painel. Quem tiver o link entra, então use só para testes.
Para voltar a pedir senha: no Render, em Environment, troque `BELLATOP_OPEN_ACCESS` para `0` (ou apague) e salve.

Com o modo de teste ligado, o servidor cadastra ao iniciar os logins da fábrica que faltarem, todos com a senha de teste `123456` (aplicada uma única vez por login, inclusive no master):
master, admin, robson (PCP), elton (Refiladeira + Flexografia), toninho (Máquinas 2/3/4), ueltom (Refiladeira),
teste (Refiladeira + Máquinas 2/3/4), welton (Refiladeira), gabriel (Flexografia), viola (Carrossel e Carrossel Pequena)
e carlos (Expedição). Antes de desligar o modo de teste e usar na fábrica, troque as senhas pela tela de usuários
(ou `npm run users:test -- --trocar-senhas-padrao`).
