---
name: pb:add
description: "Invoke when you want to queue a single, already-understood piece of work without planning a whole feature. Collects the ticket's details from the developer and writes a structured ticket into todo/ or backlog/. Use for a known fix, chore, or small change. Keywords: add ticket, queue a task, new ticket, file a ticket, todo, backlog, known fix, chore, quick task, add to queue."
---

# pb:add

Create one structured ticket in `todo/` or `backlog/`. For a single, well-understood task. If the root cause of a bug is unknown, use `pb:debug` instead.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to add:

- Confirm the ticket in a few lines: ID, Type, one-line description, where it landed.

## Steps

1. Ask the developer for the ticket's details: description, acceptance criteria, test plan, **implementation notes** (how to build it: approach, constraints, files likely involved, gotchas), **testing notes** (how to test it: what to verify, edge cases, manual steps, data or fixtures needed), dependencies, type, and optional priority (default `100`). Implementation notes and testing notes are captured when the developer has something to add; leave them empty if they do not.
2. Ask where the ticket should go (no default, do not create until the developer picks):
   ```
   Where should this ticket go?
   1. todo, ready for pb:next to pick up
   2. backlog, captured for later; pull to todo when ready
   ```
   Accept `1`/`2`, or the words `todo`/`backlog`. If ambiguous, ask again.
3. Allocate the ID with the tooling, never by hand. Derive the feature prefix (its spec dir, or `misc`/`infra` when it belongs to no feature) and run `bun ../scripts/next-id.ts <prefix>` (from `state/`) to get the next free `{prefix}-{n}`. It scans **every** queue including `done/`, so a feature whose earlier tickets already landed in `done/` keeps counting up instead of restarting at 1 and minting an ID that collides with a retired ticket. If the developer names a specific ID, verify it is free first with `bun ../scripts/next-id.ts --check <id>` (from `state/`) and refuse a taken one. Never reuse an ID that exists in any queue.
4. Create the ticket directory `state/tickets/<queue>/<id>/` with two files, following the Ticket Format (see the handbook): a brief `index.md` (ID, Type, Depends on, **Priority:** when not default, one-line description) and a full `detail.md` (Description, Acceptance Criteria, Test Plan, Implementation Notes, Testing Notes, Notes, History). The directory name must equal the `**ID:**` declared in `index.md` (the source of truth). Acceptance criteria are always required; a Test Plan is required but may be `N/A: <reason>` paired with a Manual Verification section for tickets with no testable behaviour (these live in `detail.md`). **A ticket that creates or changes a UI component may not use `N/A`, and may not defer its screenshots to a later ticket.** If the ticket adds or edits anything that renders (a React component, widget, cell, badge, card), its Test Plan and Acceptance Criteria must require screenshots of that component (light + dark), rendered **in isolation** with sample props when no page consumes it yet. If the component genuinely cannot be screenshotted on its own, do not create the ticket in that shape: restructure it so screenshots are possible (bundle the component with the first page that uses it, or have it add an isolated render/story harness). Never accept a UI-component ticket whose components cannot be screenshotted. Then commit the new ticket to the state repo: `bun ../scripts/commit-state.ts "add <id>" tickets/<queue>/<id>` (from `state/`).

## Example

```
Developer: Add a fix ticket to make the login button disabled while the request is in flight.

Created todo/auth-9/index.md (brief surface):
  **ID:** auth-9
  **Type:** Fix
  **Description:** Disable the login button while the auth request is pending.
  **Depends on:** none

Created todo/auth-9/detail.md (full body):
  **Description:** Disable the login button while the auth request is pending.
  **Acceptance Criteria:** Button is disabled on submit, re-enabled on response or error.
  **Test Plan:** Unit test the disabled state; smoke test a double-submit does not fire two requests.
  **Implementation Notes:** The button lives in LoginForm; gate it on the existing `pending` flag.
  **Testing Notes:** Cover the error path too (button must re-enable when the request fails).
```

## Next

Recommend the developer run:
- `pb:next`: if the ticket went to `todo/`.
- `pb:promote`: if it went to `backlog/`, when ready to work it.
