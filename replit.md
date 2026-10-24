# Frames

Mobile-first AI shoot director for creators filming on their phones.

## Product requirements

- Signup collects name and verified email with creation timestamp. Onboarding must not require or ask for a phone number.
- Creators write a brief or manually build a plan, edit shots, approve, upload footage for AI checks, and export an editing pack.
- Real user and agent-event records are evidence for judges. Never seed fake users, approvals, or agent events.
- Brand: FRAMES, a simple black-and-white palette with subtle blue design accents, sleek regular/light typography (not bold), film-frame logo, large tap targets.
- Free includes five tries, counted as five projects per account; the sixth project requires Pro. Existing projects remain accessible. Pro is unlimited at ₹49 through Pine Labs (checkout setup still required).

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
- The user will supply Pine Labs product docs and merchant configuration. Payment routes intentionally return setup-required errors until a documented provider adapter and verified callback are implemented. Never grant Pro from an unverified callback.
- Public publishing is initiated by the user through Publish; no public URL exists until that succeeds.

## Architecture decisions

- Original clips remain in browser IndexedDB for local ZIP export. Only three resized JPEG samples are sent for analysis, and image bytes are not persisted in the database.
- User identity and ownership come from Clerk, never request-supplied user IDs.
- Plan edits invalidate existing footage approvals to avoid exporting footage against a different plan.
- Audit records contain summaries and structured outputs, not raw video/image bytes or credentials.
- Free-project creation uses a per-user database lock to prevent concurrent-request limit bypass.
- AI writes use optimistic concurrency so a slow response cannot overwrite newer work.

## Gotchas

- Use SQL operators exported from `@workspace/db` with its tables. Multiple installed Drizzle peer instances otherwise yield incompatible nominal types.
- Never change `Api` in the OpenAPI title.
- Restart existing artifact workflows; do not create duplicate workflows.
