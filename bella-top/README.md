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
