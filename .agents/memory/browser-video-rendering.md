---
name: Browser video rendering
description: FFmpeg WebAssembly's probe status can disagree with a valid media report.
---

Treat the parsed media report as the evidence that a source contains video, not only the probe exit status.

**Why:** The single-thread FFmpeg WebAssembly core can leave its ffprobe return value at the initial `-1` sentinel even after successfully writing a valid JSON report. This was reproduced with both valid WebM-with-audio and silent MP4 sources. Rejecting that sentinel alone blocks otherwise valid exports. Encoding and concatenation exit codes still need strict success checks.

**How to apply:** On dependency upgrades or renderer changes, verify actual report contents and video streams before rejecting a source. Do not generalize this exception to encoding failures or treat an unreadable/empty report as success.
