---
name: Paid-run ambiguity
description: Why uncertain Director dispatches must not expire into a new paid run
---

Never treat an elapsed timeout or a server restart as permission to repeat a paid Director dispatch. Preserve an unresolved reservation until there is evidence of a terminal result; recover already-returned output without dispatching again.

**Why:** A provider run may continue after the HTTP client times out. An expiring lock would prevent simultaneous calls only temporarily, then charge again for the same still-running work.

**How to apply:** Keep ambiguity durable across server instances and project revisions for matching inputs. Any future reconciliation must use a documented provider status API or independently verified terminal evidence, never a guessed endpoint or inferred approval. Recovery must still respect current ownership and project revision.
