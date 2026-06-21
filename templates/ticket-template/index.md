# <id>: <short title>

**ID:** <id>
**Type:** <Feature | Tweak | Test coverage | Doc | Scaffolding | Refactor | Debug | Fix>
**Depends on:** <comma-separated ticket IDs, or remove this line if none>
**Failures:** 0
**Priority:** 100

<Briefest one-line description of what needs to be done.>

<!--
Template for a ticket's lightweight surface (state/tickets/<queue>/<id>/index.md).
The ID, type, dependencies, and a one-line description. This is what tooling and AI read to
enumerate tickets without loading every full body. The full ticket body is in the sibling detail.md.

The ticket is a directory named by its ID, containing this index.md plus detail.md and an optional evidence/ subdir.
The **ID:** field is the source of truth; the directory name mirrors it. New tickets start in todo/.

- ID form: {feature-id}-{n}, n incrementing per feature. Tickets not tied to a feature use a misc/infra prefix.
- Where possible, number n in execution order so a dependent ticket has a higher number than what it depends on. This is a reading-order hint only; **Depends on:** is what gates execution.
- **Failures:** starts at 0. pb:next increments it (via fail-ticket.ts) on each failure (any source except a human rejection); a ticket that fails three times is parked in blocked/.
- **Priority:** lower number = higher priority. Used by next-tickets.ts and board-tickets.ts to order tickets within a queue. Default 100 when omitted so legacy tickets behave as today. The line may be omitted; tooling treats absence as 100.

This file is a reference, not a ticket. Copy the shape; replace every placeholder.
-->
