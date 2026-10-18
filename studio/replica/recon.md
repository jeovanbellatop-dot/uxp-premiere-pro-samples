# Recon map — AI content-generation studio (category)

> Clean-room. This maps **what an AI-generation studio does** (the tool set and
> flows), from publicly known product capabilities in this category. No name,
> colours, identity, source code, private APIs or assets are copied. Your
> product gets its own brand (see `/replica-brand`).

## Scope

- **Platform:** Web app (responsive). Mobile later.
- **Core loop:** user picks a tool → fills a prompt / uploads media → a job runs
  on a generation engine → result appears in a gallery → user downloads,
  iterates, or publishes. Credits are spent per job.
- **For:** your own business — a creator/marketing AI studio you own and sell.
- **The capability itself (the models) is an external engine.** This recon maps
  the *tools, screens, flows and data*. The actual generation is provided by a
  pluggable provider (your own/contracted model API). See "What cannot be
  cloned".

## Tool catalogue (the "same tools")

Grouped by area. Priority is for the MVP build order.

| area | tool | what it does | priority |
| --- | --- | --- | --- |
| Image | Text→Image | prompt → image(s) | must |
| Image | Image→Image / edit | reference + prompt → variation | should |
| Image | Upscale | enlarge/enhance | should |
| Image | Remove background | cut out subject | should |
| Image | Outpaint / expand | extend canvas | could |
| Image | Relight / adjust | lighting & color | could |
| Video | Text→Video | prompt → short clip | must |
| Video | Image→Video | still + motion → clip | must |
| Video | Camera / motion presets | cinematic moves, effects | should |
| Video | Upscale video | enhance resolution | could |
| Video | Reframe / resize | aspect-ratio recut | could |
| Avatar | AI influencer / character | consistent character across shots | should |
| Avatar | Character sheet | multi-angle reference set | could |
| Audio | Text→Speech | voiceover from text | should |
| Audio | Voice clone / create | custom voice | could |
| Audio | Lipsync / dubbing | match voice to video | could |
| Marketing | Product shots | product photo scenes | should |
| Marketing | UGC / ad creatives | short ad videos/posters | could |
| 3D | Image→3D | mesh/GLB from image | could |
| Insights | Virality / video analysis | score & feedback | could |
| Publish | Export / social publish | download or post out | should |
| Platform | Projects & assets | organise generations | must |
| Platform | Accounts & auth | sign up / log in | must |
| Platform | Credits & billing | buy credits, spend per job | must |
| Platform | Job queue & history | async jobs, status, retry | must |

## Screen inventory

`ID | screen | route | purpose | key components | states`

- S01 | Landing | `/` | pitch + CTA | hero, tool grid, pricing teaser | public
- S02 | Sign up / Log in | `/auth` | account | auth form, OAuth buttons | empty, error
- S03 | Dashboard | `/app` | home after login | tool grid, recent generations, credit balance | empty, filled
- S04 | Tool runner | `/app/tool/:slug` | run one tool | prompt box, params panel, upload, run button, cost estimate | empty, running, done, error, no-credits
- S05 | Job result | `/app/job/:id` | one generation | media viewer, params used, actions (download/variate/publish) | loading, done, failed
- S06 | Gallery / Library | `/app/library` | all generations | grid, filters, folders | empty, filled
- S07 | Project | `/app/project/:id` | grouped work | asset list, rename, share | empty, filled
- S08 | Billing | `/app/billing` | credits & plan | balance, buy credits, plan cards, invoices | filled
- S09 | Settings | `/app/settings` | account & providers | profile, API/provider keys, danger zone | filled
- S10 | Admin (optional) | `/admin` | ops | users, jobs, usage | filled

## User flows

```
F01 Generate an image (core loop)
    S03 dashboard -> S04 pick Text→Image, write prompt, see cost -> run
    -> job queued -> S05 result -> download / make variation
    edge: not enough credits (S04 no-credits), engine error (S05 failed),
          long job (S05 loading/polling)

F02 Generate a video from an image
    S03 -> S04 Image→Video, upload still, choose motion -> run -> S05

F03 Buy credits
    S04 no-credits -> S08 billing -> Stripe checkout -> balance updates -> back to S04

F04 Organise & reuse
    S06 library -> move to S07 project -> use a past result as input in S04

F05 Sign up & first run
    S01 -> S02 sign up -> free starter credits -> S03 -> F01
```

Happy-path click count for F01: **4** (pick tool, prompt, run, download). Beat it.

## Components

Button, Input, Textarea (prompt), Select, Slider (params), FileDropzone,
ToolCard, MediaViewer (image/video), JobStatusBadge, CreditBalance, Modal,
Toast, Nav, Tabs, PricingCard, EmptyState, Skeleton/Loader.

## Inferred data model

```
User      id, email, name, created_at, credits_balance
Provider  id, user_id, kind (image|video|audio|...), config(json, encrypted key)   // pluggable engine
Tool      slug, area, name, description, input_schema(json), credit_cost
Job       id, user_id, tool_slug, status (queued|running|done|failed),
          params(json), input_asset_ids[], output_asset_ids[], cost,
          error, created_at, finished_at
Asset     id, user_id, project_id?, kind, url, meta(json), source (upload|output)
Project   id, user_id, name, created_at
CreditTxn id, user_id, delta, reason (purchase|job|refund), job_id?, stripe_id?
```

Confidence: high for the platform entities (standard SaaS), the generation
params per tool depend on the chosen engine.

## What cannot be cloned (skip)

- **The generative models themselves** — proprietary to whoever trains them and
  run on GPU infra. You integrate an engine (your own, or a model API you pay
  for); you do not reproduce the models. *This is the single biggest dependency.*
- Any specific company's name, UI identity, copy, logos, or stock/asset library.
- Their user network, their content, their partner/platform deals.
- Private APIs or endpoints — we build our own against a chosen provider's
  public API.

## Size

- Screens 10, flows 5, entities 7.
- Hard parts: (1) the generation engine integration + async job queue, (2)
  credits/billing with Stripe, (3) media storage & delivery.
- **Overall: L** (a quarter for the full catalogue). **MVP: M** — F01+F03+F05
  with 2–3 tools (Text→Image, Image→Video) on one provider, is a few weeks and
  is the right first slice.

## Next

`/replica-architect` to pick the stack, schema and API, then build the MVP
vertical slice: sign up → buy/seed credits → Text→Image → result → download.
