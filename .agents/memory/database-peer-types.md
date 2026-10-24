---
name: Database peer types
description: Why the database package owns SQL operator imports.
---

Keep SQL operators and table definitions on the same Drizzle dependency instance.

**Why:** Adding auth and AI SDK dependencies introduced an OpenTelemetry peer variant of Drizzle in the API package, while the database package retained a different peer variant. Identical version numbers still produced incompatible protected/private TypeScript members.

**How to apply:** Prefer the database package's exported operators when using its tables. If extending the query vocabulary, export the operator there rather than introducing cross-instance imports or type assertions.
