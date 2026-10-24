---
name: Mobile workflow layout verification
description: Avoid masking overflow and verify the real Studio, Plan, Shoot and Edit components at phone widths.
---

Verify mobile sizing on the actual workflow components, not only the landing or sign-in pages. Do not use page-level overflow clipping as the fix for unreachable content.

**Why:** The user reported half the screen missing after a mobile pass that checked public screens but left intrinsic-width form grids unchecked. Hiding horizontal overflow concealed the problem.

**How to apply:** Constrain grid tracks and shrinkable children explicitly, and check Studio, Plan, Shoot and Edit at narrow phone widths. Temporary in-memory layout fixtures can exercise the real components without creating fake users, approvals or agent-event evidence; remove those fixtures after inspection.
