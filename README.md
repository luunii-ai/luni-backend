# Backend Beleza Estratégica

API Node.js (Express + Mongoose) na porta **3001**. Não inclui a rota `/v1/enhance` (agente separado).

## Requisitos

- Node 18+
- MongoDB em execução local (ou ajuste `MONGODB_URI`)

## Configuração

1. Copie `.env.example` para `.env` se necessário.
2. `npm install`
3. `npm run dev`

Variáveis:

- `PORT` — padrão 3001
- `MONGODB_URI` — ex.: `mongodb://127.0.0.1:27017/beleza_estrategica`
- `JWT_SECRET` — string forte
- `CORS_ORIGIN` — ex.: `http://localhost:8080` (origem do Vite)

- **`npm run dev:test`** — sobe a API com `.env-test` (Stripe Test, URLs localhost). Requer Node 20+.
- **`npm run start:test`** — igual, sem `--watch`.

## Rotas principais

- `POST /api/auth/signup`, `POST /api/auth/login`
- `GET /api/me`, `PATCH /api/me` (Bearer)
- `GET /api/procedures`, CRUD pacientes, simulações, `GET /api/dashboard/summary` — em `procedures`, o campo **`defaultEnhanceRegions`** descreve regiões PT padrão para a IA (Nova simulação no portal).


Health: `GET /health`

## Contas parceiro (teste) e cupons Stripe

- **Admin:** defina `ADMIN_API_KEY` (string longa e secreta). Com header `x-admin-key: <valor>`, pode criar contas parceiro:
  - `POST /api/admin/partner-users` — body JSON: `email`, `name`, opcional `clinic`, `password`, `simulationCredits` (default 10), `previewCredits` (default 5), `partnerTestExpiresAt` (ISO) ou `partnerTestDurationDays` (número de dias a partir da criação). Sem `password`, é gerada senha temporária e enviado e-mail (se Resend configurado).
- **Analytics de custo de IA** (Postman ou qualquer cliente HTTP), mesmo header `x-admin-key`:
  - `GET /api/admin/usage/summary?from=2026-06-01&to=2026-06-30` — totais, médias (`costPerGenerationUsd`, `costPerSuccessfulGenerationUsd`, etc.)
  - `GET /api/admin/usage/by-user?sort=cost&limit=20` — ranking por clínica
  - `GET /api/admin/usage/by-user/:userId` — detalhe + últimas gerações
  - `GET /api/admin/usage/daily?from=2026-06-01` — custo por dia
  - `GET /api/admin/usage/generations?eventType=preview&outcome=success&page=1&limit=50` — lista de eventos
  - Custo calculado no backend a partir de `usage_report` do agente (tokens Google/Agno). Variáveis: `GEMINI_INPUT_USD_PER_1M`, `GEMINI_IMAGE_OUTPUT_USD_PER_1M`, `USD_TO_BRL`.
- Contas com `accountType: partner_test` têm cota fixa de simulações e pré-visualização (sem renovação mensal automática) até contratarem plano pago.
- **Bloqueio (app + API):** sem `stripeSubscriptionId`, a conta parceira fica bloqueada para rotas operacionais quando `simulationCreditsRemaining <= 0` ou quando `partnerTestExpiresAt` já passou (instante UTC). Resposta **403** com `code: 'PARTNER_TEST_LOCKED'` (exceto `GET/PATCH /api/me`, `POST /api/subscriptions/checkout-official`, `GET /api/subscriptions/current`, `POST /api/subscriptions/portal`, planos e checkout público).
- **Bypass assinatura (donos):** `SUBSCRIPTION_BYPASS_USER_IDS` — lista de `_id` Mongo (vírgula) de contas que nunca entram em bloqueio por `past_due` / assinatura cancelada. O portal recebe `subscriptionBillingBypass: true` em `/me`. Essas contas **sempre** renovam cotas mensais na virada do mês civil, independentemente do `subscriptionStatus`.
- **`STRIPE_RETURN_URL`:** para checkout **embedded** iniciado na **app de gestão**, use a URL dessa app, ex. `http://localhost:8080/configuracoes/assinatura?session_id={CHECKOUT_SESSION_ID}` (ajuste host/porta).
- **Upgrade sem trial:** utilizador parceiro autenticado: `POST /api/subscriptions/checkout-official` com `priceId` e opcional `promotionCode` e `checkoutUi` (`embedded` ou `hosted`). Após o webhook, a conta passa a `official` e quotas seguem o plano Stripe.
- **Cupons:** crie *Coupons* e *Promotion codes* no [Dashboard Stripe](https://dashboard.stripe.com). No checkout público (`POST /api/subscriptions/checkout`), campo opcional `promotionCode` aplica o código; se omitido, o Stripe Checkout exibe campo para cupom (`allow_promotion_codes`).
- Nunca commite `ADMIN_API_KEY` nem partilhe em clients públicos.

## Cotas mensais (simulações e pré-visualizações)

- Mapas de cota por Price ID: `SIMULATION_QUOTA_BY_PRICE_ID` e `PREVIEW_QUOTA_BY_PRICE_ID` (JSON no `.env`).
- **Renovação mensal civil** (virada de mês em `SIMULATION_QUOTA_TIMEZONE`, padrão `America/Sao_Paulo`): contas `official` com `subscriptionStatus === 'active'` e `stripeSubscriptionId` preenchido; **ou** contas em `SUBSCRIPTION_BYPASS_USER_IDS` (admin), sem validar status Stripe. Disparada no login (`GET /api/me`), ao debitar simulação ou pré-visualização.
- **Sem renovação mensal:** `trialing`, `past_due`, `unpaid`, `canceled` e demais status fora de `active`. Contas `partner_test` mantêm cota fixa até upgrade.
- **Recuperação após pagamento:** webhook Stripe `customer.subscription.updated` — transição de `past_due`, `unpaid`, `incomplete` ou `incomplete_expired` para `active` restaura cotas do plano imediatamente.
- Status terminais (`canceled`, `unpaid`, `incomplete_expired`) zeram cotas via webhook.
