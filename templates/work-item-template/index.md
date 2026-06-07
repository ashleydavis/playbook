# <id>: <short title>

**ID:** <id>
**Type:** <Feature | Tweak | Test coverage | Doc | Scaffolding | Refactor | Debug | Fix>
**Depends on:** <comma-separated work-item IDs, or remove this line if none>
**Failures:** 0

<Briefest one-line description of what needs to be done.>

<!--
Template for a work item's lightweight surface (state/work-items/<queue>/<id>/index.md).
The ID, type, dependencies, and a one-line description. This is what tooling and AI read to
enumerate work items without loading every full body. The full item body is in the sibling detail.md.

The item is a directory named by its ID, containing this index.md plus detail.md and an optional evidence/ subdir.
The **ID:** field is the source of truth; the directory name mirrors it. New items start in todo/.

- ID form: {feature-id}-{n}, n incrementing per feature. Items not tied to a feature use a misc/infra prefix.
- Where possible, number n in execution order so a dependent item has a higher number than what it depends on. This is a reading-order hint only; **Depends on:** is what gates execution.
- **Failures:** starts at 0. pb:next increments it (via fail-work-item.ts) on each failure (any source except a human rejection); an item that fails three times is parked in blocked/.

This file is a reference, not a work item. Copy the shape; replace every placeholder.
-->
