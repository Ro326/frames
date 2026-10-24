# Threat Model

## Project Overview

Frames is a mobile-first AI "shoot director" for creators. It is a PNPM workspace with:

- **Frontend** — React + Vite SPA (`artifacts/frames`), served at `/`.
- **API** — Express service (`artifacts/api-server`), mounted at `/api`.
- **Database** — PostgreSQL via Drizzle (`lib/db/src/schema`), tables: users, projects, agent_events, payments.
- **Auth** — Replit-managed Clerk. Server identity comes from the Clerk session (`getAuth(req).userId`); local creator profiles are tied to the verified Clerk identity. Request-supplied user IDs are never trusted.
- **External services** — Replit Anthropic (visual Frame Checker), AgenticOrg hackathon agent (Frames Director), ElevenLabs (voiceover MP3). Manual UPI checkout for Frames Pro (₹49), verified only by a password-protected admin.
- **Design artifact** — `artifacts/mockup-sandbox` (`/__mockup`), dev-only canvas.

Deployment: autoscale, public visibility, `https://frames-ai.replit.app`, TLS handled by Replit.

## Assets

- **User accounts / Clerk sessions** — compromise enables impersonation and access to projects and payment history.
- **Project data** — briefs, shot plans, verdicts, coverage; owned per user.
- **Payment records** — manual UPI claims (12-digit UTR), Pro entitlement flag (`users.pro`). Improper handling could grant Pro without payment.
- **Application secrets** — `CLERK_SECRET_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AGENTICORG_API_KEY`, `AGENTICORG_AGENT_ID`, `ELEVENLABS_API_KEY`, `ADMIN_PASSWORD`, DB connection string. Server-only.
- **Public config (not secret)** — `FRAMES_UPI_ID`, `FRAMES_UPI_PAYEE_NAME`, Clerk publishable key. Intentionally public.

## Trust Boundaries

- **Browser → API** — every `/api` request is untrusted; identity established server-side via Clerk. CORS `origin:false` and a `sec-fetch-site: cross-site` rejection for state-changing methods mitigate CSRF.
- **API → PostgreSQL** — all queries use Drizzle parameterized builders scoped by `userId`.
- **API → external services (Anthropic / AgenticOrg / ElevenLabs)** — outbound; secrets kept server-side, responses redacted before audit logging, AgenticOrg URL validated (HTTPS, UUID agent id, `redirect:"error"`).
- **User → Admin** — `/admin` gated by HTTP Basic auth with constant-time SHA-256 comparison of `ADMIN_PASSWORD`; disabled (503) when unset.
- **Free vs Pro** — five-project free limit enforced under a per-user `SELECT ... FOR UPDATE` lock; Pro granted only atomically in the admin review transaction.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/routes/*` (account, projects, director, checker, services, payments, admin, health), composed in `routes/index.ts`, app wiring in `app.ts`.
- **Access-control helper:** `artifacts/api-server/src/lib/frames.ts` (`currentUser`, `ownedProject`) — every project/resource route resolves ownership through these, scoping by both object id and `userId`.
- **Highest-risk areas:** payment/entitlement flow (`routes/payments.ts`, `lib/payments.ts`, `lib/upi-model.ts`), admin (`routes/admin.ts`), AgenticOrg outbound (`lib/agenticorg-director.ts`), Clerk FAPI proxy (`middlewares/clerkProxyMiddleware.ts`).
- **Public surfaces:** `/api/health`, `/api/status`, `/api/me` (returns auth=false when anonymous). **Authenticated:** projects/director/checker/services/payments. **Admin:** `/api/admin*`.
- **Dev-only (ignore unless proven reachable):** `artifacts/mockup-sandbox` (`/__mockup`), `*.test.ts` files.

## Threat Categories

### Spoofing
Identity derives from the Clerk session only; `/me` POST additionally verifies the submitted email against a Clerk-verified address. Admin uses Basic auth with timing-safe comparison. Legacy payment-provider callbacks (`/pay/callback`, `/pay/webhook`) return 410 and cannot grant Pro. Guarantee: all sensitive endpoints must resolve identity via `getAuth`/`currentUser`, never request-supplied ids.

### Tampering
Prices/amounts are server-fixed (`PRO_AMOUNT`). Zod schemas strip unknown fields (no mass assignment of `pro`, `userId`, etc.); writes always override `userId` server-side. Plan edits invalidate approvals; AI/clip writes use optimistic concurrency (`updatedAt` guard) and `FOR UPDATE` locks. Guarantee: object-mutating routes must scope by owner and preserve concurrency guards.

### Information Disclosure
List/read routes (`/projects`, `/activity`, `/pay/:id`) filter by `userId`; cross-user access returns 404. Admin bulk views are password-gated. Outbound-agent responses are redacted (secrets/UUIDs stripped) before audit storage. Error handler returns generic messages for 5xx. Guarantee: no route may return records outside the caller's ownership scope; secrets must never reach the client or logs.

### Elevation of Privilege
`users.pro` is set only inside `reviewManualPayment`'s transaction after admin confirmation (`assertReviewable` enforces amount, currency, status, valid UTR). Free limit enforced under per-user lock. Guarantee: Pro entitlement must never be grantable by a redirect, submitted UTR, or client input.

### Denial of Service
Global rate limiter (120/min), AI routes (12/min), admin (15/15min), payment checkout (15/15min). JSON body capped at 3mb. External calls have timeouts (90–120s). Guarantee: public and AI/payment endpoints must stay rate-limited and bounded.
