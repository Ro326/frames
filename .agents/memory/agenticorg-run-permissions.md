---
name: AgenticOrg run-only credentials
description: Hackathon run keys can be rejected by agent-details endpoints while executing UUID-based runs successfully.
---

Verify AgenticOrg credentials against the operation the key is intended to authorize. A rejected agent-details GET does not establish that the key cannot execute an agent.

**Why:** The hackathon email specifies default `agents:run` scope. The saved key repeatedly received 401 on agent-details GETs but successfully executed the UUID-based POST `/api/v1/agents/{id}/run`. Requests for replacement keys based only on GET failures were misleading.

**How to apply:** Keep the hackathon base URL and UUID dispatch; use the documented run request for an explicitly authorized connectivity test. Distinguish HTTP success from execution status: `hitl_triggered` means dashboard approval is pending, not an invalid key or a completed autonomous run. Do not change review thresholds without permission.

Treat the returned execution status as authoritative even when its confidence explanation appears inconsistent.

**Why:** A real Director run returned valid plan JSON and confidence 0.90, yet its status was `hitl_triggered` with the explanation `condition matched: confidence < 0.88`. Confidence alone cannot establish that review was cleared.

**How to apply:** Keep provider status accurate in audit records; do not infer external approval from confidence or a local action. The user rejected dashboard-blocking for shoot planning: valid returned output may be shown as an editable local draft for explicit approval inside Frames, without claiming that upstream review was cleared.
