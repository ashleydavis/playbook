---
name: pb:plan
description: Invoke when you want to plan a new feature or revise an existing one before any code is written. Brainstorms the design with the developer when the feature is unclear, then updates docs/spec/ and docs/testing-manual/, and optionally breaks the feature into work items in todo/ with dependencies. Keywords: plan, planning, new feature, design, spec, brainstorm, update the spec, refine an idea, scope a feature, break into work items, testing manual.
---

# pb:plan

Plan or update a feature. The output is an agreed spec and testing manual, optionally broken into queued work items. This is design work, not implementation.

## Steps

1. Ask the developer what feature they want to plan or update.
2. **Brainstorm first when the feature is unclear.** Before touching the spec, refine the rough idea with the developer: ask clarifying questions, surface assumptions, explore alternatives, and present the proposed shape for sign-off. This is a conversation, not a document edit. Skip it only when the developer already knows exactly what they want and says so. The point is to settle the design before it is written down, so the spec records a decision rather than a first guess.
3. Update `docs/spec/` to reflect the agreed feature, adding or revising the relevant section.
4. Update `docs/testing-manual/` to cover how the developer can manually test it.
5. Optionally, break the feature into work items in `todo/`, each with acceptance criteria and a test plan derived from the spec. This step can be deferred to a later `pb:plan` session.
6. Set dependencies between any new work items so they implement in the right order. Where possible, number the items in execution order too, so a dependent item gets a higher number than the items it depends on.
7. If you queued any work items, update `current-state.md` to reflect them: add or amend only the entries this change affects (leaving the rest of its existing content intact), so the snapshot stays accurate.

## Example

```
Developer: I want users to be able to reset their password.

Claude (brainstorm): A few questions before I write this up:
- Reset by email link, or by answering security questions?
- Should the link expire? After how long?
- Do we invalidate active sessions on reset?

(after agreement)
Updated docs/spec/auth/detail.md with the Password Reset section.
Updated docs/testing-manual/auth/detail.md with the reset walkthrough.
Queued todo/auth-7 (reset request endpoint) and auth-8 (reset confirm + session invalidation).
auth-8 depends on auth-7.
```
