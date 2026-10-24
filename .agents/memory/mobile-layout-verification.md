---
name: Mobile workflow layout verification
description: Avoid masking overflow and verify the real Studio, Plan, Shoot and Edit components at phone widths.
---

Verify mobile sizing on the actual workflow components, not only the landing or sign-in pages. Do not use page-level overflow clipping as the fix for unreachable content.

**Why:** The user reported half the screen missing after a mobile pass that checked public screens but left intrinsic-width form grids unchecked. Hiding horizontal overflow concealed the problem.

**How to apply:** Constrain grid tracks and shrinkable children explicitly, and check Studio, Plan, Shoot and Edit at narrow phone widths. Temporary in-memory layout fixtures can exercise the real components without creating fake users, approvals or agent-event evidence; remove those fixtures after inspection.

Keep primary mobile workflow actions visible before the user reaches the end of a long shot list, and retain a next-step action after approval.

**Why:** A bottom-sticky action at the end of a long plan can appear missing. A fixed action inside a transformed ancestor can also anchor to that ancestor instead of the viewport, so changing only `sticky` to `fixed` is not enough.

**How to apply:** Check action visibility in both unapproved and already-approved states at narrow phone widths, including under transformed page shells. Leave scroll clearance for the last form fields and account for the device's bottom safe area.
