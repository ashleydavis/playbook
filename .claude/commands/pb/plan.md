---
name: pb:plan
description: "Invoke when you want to plan a new feature or revise an existing one before any code is written. Brainstorms the design with the developer when the feature is unclear, then updates docs/spec/ and docs/testing-manual/, and optionally breaks the feature into tickets in todo/ with dependencies. Keywords: plan, planning, new feature, design, spec, brainstorm, update the spec, refine an idea, scope a feature, break into tickets, testing manual."
---

# pb:plan

Plan or update a feature. The output is an agreed spec and testing manual, optionally broken into queued tickets. This is design work, not implementation.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to plan:

- Brainstorm one question at a time.
- When done, report what changed in a few lines: spec/manual sections updated, tickets queued and their dependencies.

## Steps

1. Ask the developer what feature they want to plan or update.
2. **Brainstorm first when the feature is unclear.** Before touching the spec, refine the rough idea with the developer: ask clarifying questions, surface assumptions, explore alternatives, and present the proposed shape for sign-off. This is a conversation, not a document edit. Skip it only when the developer already knows exactly what they want and says so. The point is to settle the design before it is written down, so the spec records a decision rather than a first guess.
3. Update `project/docs/spec/` to reflect the agreed feature, adding or revising the relevant section.
4. Update `project/docs/testing-manual/` to cover how the developer can manually test it.
5. Optionally, break the feature into tickets. Before creating any ticket directories in this step, ask once per batch where they should land (no default):
   ```
   Where should this ticket go?
   1. todo, ready for pb:next to pick up
   2. backlog, captured for later; pull to todo when ready
   ```
   Accept `1`/`2`, or `todo`/`backlog`. All tickets in the batch share the chosen queue. Create each in `state/tickets/<queue>/<id>/` with acceptance criteria and a test plan derived from the spec. When landing in `backlog/`, still set `**Depends on:**` and assign ascending priorities (e.g. first ticket `**Priority:** 10`, next `20`). Commit each new ticket: `bun ../scripts/commit-state.ts "add <id>" tickets/<queue>/<id>` (from `state/`). This step can be deferred to a later `pb:plan` session.
6. Set dependencies between any new tickets so they implement in the right order. Where possible, number the tickets in execution order too, so a dependent ticket gets a higher number than the tickets it depends on.
7. If you queued any tickets, update `state/current-state.md` to reflect them: add or amend only the entries this change affects (leaving the rest of its existing content intact), so the snapshot stays accurate. Commit it: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).

## Example

```
Developer: I want users to be able to reset their password.

Claude (brainstorm): A few questions before I write this up:
- Reset by email link, or by answering security questions?
- Should the link expire? After how long?
- Do we invalidate active sessions on reset?

(after agreement)
Updated project/docs/spec/auth/detail.md with the Password Reset section.
Updated project/docs/testing-manual/auth/detail.md with the reset walkthrough.
Queued todo/auth-7 (reset request endpoint) and auth-8 (reset confirm + session invalidation).
auth-8 depends on auth-7.
```
