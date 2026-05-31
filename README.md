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

O seed de **procedimentos** roda automaticamente na subida se a collection estiver vazia. Para rodar só o seed: `npm run seed`.

## Rotas principais

- `POST /api/auth/signup`, `POST /api/auth/login`
- `GET /api/me`, `PATCH /api/me` (Bearer)
- `GET /api/procedures`, CRUD pacientes, simulações, `GET /api/dashboard/summary` — em `procedures`, o campo **`defaultEnhanceRegions`** descreve regiões PT padrão para a IA (Nova simulação no portal).


Health: `GET /health`

## Contas parceiro (teste) e cupons Stripe

- **Admin:** defina `ADMIN_API_KEY` (string longa e secreta). Com header `x-admin-key: <valor>`, pode criar contas parceiro:
  - `POST /api/admin/partner-users` — body JSON: `email`, `name`, opcional `clinic`, `password`, `simulationCredits` (default 10), `previewCredits` (default 5), `partnerTestExpiresAt` (ISO) ou `partnerTestDurationDays` (número de dias a partir da criação). Sem `password`, é gerada senha temporária e enviado e-mail (se Resend configurado).
- Contas com `accountType: partner_test` têm cota fixa de simulações e pré-visualização (sem renovação mensal automática) até contratarem plano pago.
- **Bloqueio (app + API):** sem `stripeSubscriptionId`, a conta parceira fica bloqueada para rotas operacionais quando `simulationCreditsRemaining <= 0` ou quando `partnerTestExpiresAt` já passou (instante UTC). Resposta **403** com `code: 'PARTNER_TEST_LOCKED'` (exceto `GET/PATCH /api/me`, `POST /api/subscriptions/checkout-official`, `GET /api/subscriptions/current`, `POST /api/subscriptions/portal`, planos e checkout público).
- **Bypass assinatura (donos):** `SUBSCRIPTION_BYPASS_USER_IDS` — lista de `_id` Mongo (vírgula) de contas que nunca entram em bloqueio por `past_due` / assinatura cancelada. O portal recebe `subscriptionBillingBypass: true` em `/me`.
- **`STRIPE_RETURN_URL`:** para checkout **embedded** iniciado na **app de gestão**, use a URL dessa app, ex. `http://localhost:8080/configuracoes/assinatura?session_id={CHECKOUT_SESSION_ID}` (ajuste host/porta).
- **Upgrade sem trial:** utilizador parceiro autenticado: `POST /api/subscriptions/checkout-official` com `priceId` e opcional `promotionCode` e `checkoutUi` (`embedded` ou `hosted`). Após o webhook, a conta passa a `official` e quotas seguem o plano Stripe.
- **Cupons:** crie *Coupons* e *Promotion codes* no [Dashboard Stripe](https://dashboard.stripe.com). No checkout público (`POST /api/subscriptions/checkout`), campo opcional `promotionCode` aplica o código; se omitido, o Stripe Checkout exibe campo para cupom (`allow_promotion_codes`).
- Nunca commite `ADMIN_API_KEY` nem partilhe em clients públicos.
