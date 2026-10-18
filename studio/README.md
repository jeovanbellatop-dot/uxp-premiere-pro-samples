# Studio — your AI content generation app

A clean-room AI creation studio (your own brand): a tool grid, per-user accounts,
credits, projects and a library — powered by Google's Gemini API.

> Built functionality-first, clean-room. No other product's name, UI, code or
> assets are used.

## Features

- **Accounts** — email + password sign up / log in, cookie sessions, hashed passwords.
- **Tools** (per-user, credit-metered, job history):
  - Text → Image, Edit Image, Product Shot — `gemini-3.1-flash-image`
  - Prompt Enhancer, Ad Copy, Video Script — `gemini-3.8-flash`
  - Analyze Image (vision) — `gemini-3.8-flash`
  - Voiceover (TTS) — `gemini-3.8-flash-tts`
  - Text/Image → Video — ⏳ needs a Veo-enabled key
- **Projects & library** — organise generations; filter the library by project.
- **Credits & billing** — Stripe checkout (test/live). Without Stripe keys it runs
  in dev mode and adds credits instantly so you can test the flow.
- **SQLite** — zero-setup database, created on first run at `data/studio.db`.

## Requirements

- Node.js 18.18+
- For real generation: a Google AI Studio key **with billing enabled** — generation
  is paid. Without balance every call returns `402 prepayment credits are depleted`.
  Enable at <https://ai.studio/projects> (docs: <https://ai.google.dev/gemini-api/docs/billing>).

## Run

```bash
cp .env.example .env.local     # set GEMINI_API_KEY (Stripe keys optional)
npm install
npm run dev                    # http://localhost:3000
```

Open `/` (landing) → sign up → `/app` (studio). New accounts start with 100 credits.

Production:

```bash
npm run build && npm start
```

## Architecture

```
app/page.tsx              landing (public)
app/login                 sign up / log in
app/app                   the studio (auth-gated) -> components/Studio.tsx
app/billing               credit packs -> components/BillingClient.tsx
app/settings              account + provider status
app/api/auth/*            signup / login / logout
app/api/generate          job runner: auth -> job -> Gemini -> spend credits -> asset
app/api/projects          projects CRUD + assign asset to project
app/api/billing/*         Stripe checkout + webhook (dev-mode fallback)
app/api/me                current user + assets + projects
lib/db.ts                 SQLite schema (users, sessions, projects, assets, jobs, credit_txns)
lib/auth.ts               password hashing (scrypt), sessions, cookie
lib/store.ts              per-user data access
lib/gemini.ts             the only file that talks to Gemini (key stays server-side)
lib/tools.ts              tool catalogue
lib/billing.ts            credit packs + Stripe helper
```

## Stripe (optional, for real payments)

1. Put `STRIPE_SECRET_KEY` in `.env.local`.
2. Create a webhook to `/api/billing/webhook` for `checkout.session.completed`,
   and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Without these, "Buy credits" credits the account directly (dev mode).

## Still to do before selling

- Email verification + password reset.
- Rate limiting and a real async queue for slow generations (and Veo for video).
- Move media from `public/generated` to object storage (S3/R2) for production.

## Security

- Keys are read server-side from env only; they never reach the browser.
- `.env.local` and `data/` are gitignored.
- Rotate any key you ever pasted into a chat or shared.
