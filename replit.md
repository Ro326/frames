# Frames

Mobile-first AI shoot director for creators filming on their phones.

## Product requirements

- Signup collects name and verified email with creation timestamp. Onboarding must not require or ask for a phone number.
- Creators write a brief or manually build a plan, edit shots, approve, upload footage for AI checks, and export an editing pack.
- Finished MP4 is the primary export; keep the original-clip ZIP as an optional editing pack. Start with basic cuts and original audio. Camera overlays and gyro assistance are deferred until the user requests them.
- Creators may not know filming jargon such as pan or dolly zoom. Explain shot angles and movements visually with lightweight animated diagrams and plain-language instructions, with an easier option for advanced moves.
- Real user and agent-event records are evidence for judges. Never seed fake users, approvals, or agent events.
- Brand: FRAMES, a simple black-and-white palette with subtle blue design accents, sleek regular/light typography (not bold), film-frame logo, large tap targets.
- Free includes five tries, counted as five projects per account; the sixth project requires Pro. Existing projects remain accessible. Pro is unlimited at ₹49 through Pine Labs hosted checkout in UAT/test mode.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — managed API service.
- `pnpm --filter @workspace/frames run dev` — managed frontend at `/`.
- `pnpm run typecheck` — type checks.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate contracts.
- `pnpm --filter @workspace/db run push` — development schema changes.

## Stack and locations

- React + Vite frontend in `artifacts/frames`.
- Express API in `artifacts/api-server`, mounted at `/api`.
- PostgreSQL + Drizzle tables in `lib/db/src/schema`.
- OpenAPI source of truth: `lib/api-spec/openapi.yaml`.
- Replit-managed Clerk authentication, with local creator profiles tied to verified Clerk identity.
- Replit Anthropic integration for Director and Frame Checker.
- Exact user-supplied system prompts live in `server/prompts.js`. Director responses are validated and mapped to the existing editable plan fields; malformed JSON or invalid response shapes get one retry, and each model attempt is audited independently.

## Setup still needed

- `ADMIN_PASSWORD` enables the password-protected admin report.
- ElevenLabs connection or `ELEVENLABS_API_KEY` enables generated MP3 voiceovers. Optional `ELEVENLABS_VOICE_ID` selects the voice.
- Pine Labs uses the official hosted checkout API at `https://pluraluat.v2.pinepg.in`: OAuth client credentials, `/api/checkout/v1/orders`, then server-side GET `/api/pay/v1/orders/{order_id}`. ₹49 is 4900 paise. `PINELABS_MERCHANT_ID`, `PINELABS_CLIENT_ID`, `PINELABS_CLIENT_SECRET` are required Secrets; `PINELABS_ENV=uat` is enforced. Never grant Pro from a redirect, notification status, or authorization alone: verify merchant, order/reference, currency, amount and processed payment server-side. The existing `users.pro` field is the Pro entitlement.
- Return callbacks use `/api/pay/callback`; `/api/pay/webhook` accepts notifications and independently queries Pine Labs. Register the webhook URL with Pine Labs during onboarding. Browser success is shown only from the verified own-payment API. No callback-signature credential is assumed to be the OAuth client secret; callback bodies are not accepted as payment proof.
- Coverage runs after every successful clip check (match or mismatch) and human override. Use `AGENTICORG_BASE_URL=https://agenticorg.hackathon.pinelabs.com` and `POST /api/v1/agents/{AGENTICORG_AGENT_ID}/run`, authenticated with Bearer `AGENTICORG_API_KEY`. Store the agent UUID in Secrets as `AGENTICORG_AGENT_ID`; never discover agents by name or call the old A2A endpoint. Body: `{"action":"process","inputs":{"task":"<JSON string of full plan, verdicts and response contract>"},"context":{}}`. Do not log the key or secret agent UUID. Failure is logged and labeled local coverage; human approval always remains authoritative.
- AgenticOrg receives plan text and all verdicts, never footage or frame images. Responses must account for every shot and preserve human approvals. Persist coverage only if the shot revision has not changed during the call; editing/regenerating a plan or retaking a shot invalidates old coverage.
- Database additions for these integrations are the payments table and nullable project coverage. Apply the additive development schema to the production database through the normal migration process before publishing these changes; do not seed fake payment or agent-call evidence.
- Public publishing is initiated by the user through Publish; no public URL exists until that succeeds.

## Architecture decisions

- Original clips remain in browser IndexedDB for local MP4 rendering and ZIP export. Only three resized JPEG samples are sent for analysis, and image bytes are not persisted in the database.
- User identity and ownership come from Clerk, never request-supplied user IDs.
- Plan edits invalidate existing footage approvals to avoid exporting footage against a different plan.
- Audit records contain summaries and structured outputs, not raw video/image bytes or credentials.
- Free-project creation uses a per-user database lock to prevent concurrent-request limit bypass.
- AI writes use optimistic concurrency so a slow response cannot overwrite newer work.

## Gotchas

- Use SQL operators exported from `@workspace/db` with its tables. Multiple installed Drizzle peer instances otherwise yield incompatible nominal types.
- Never change `Api` in the OpenAPI title.
- Restart existing artifact workflows; do not create duplicate workflows.
