---
name: pb:add
description: Invoke when you want to queue a single, already-understood piece of work without planning a whole feature. Collects the ticket's details from the developer and writes a structured ticket into todo/. Use for a known fix, chore, or small change. Keywords: add ticket, queue a task, new ticket, file a ticket, todo, known fix, chore, quick task, add to queue.
---

# pb:add

Create one structured ticket in `todo/`. For a single, well-understood task. If the root cause of a bug is unknown, use `pb:debug` instead.

## Output style

Follow the project's [output format](../../../output-format.md) (load it once per session if it is not already in your context). Specific to add:

- Confirm the ticket in a few lines: ID, Type, one-line description, where it landed.

## Steps

1. Ask the developer for the ticket's details: description, acceptance criteria, test plan, dependencies, and type.
2. Create the ticket directory `state/tickets/todo/<id>/` with two files, following the Ticket Format (see the handbook): a brief `index.md` (ID, Type, Depends on, one-line description) and a full `detail.md` (Description, Acceptance Criteria, Test Plan, Notes, History). The directory name must equal the `**ID:**` declared in `index.md` (the source of truth). Acceptance criteria are always required; a Test Plan is required but may be `N/A: <reason>` paired with a Manual Verification section for tickets with no testable behaviour (these live in `detail.md`). Then commit the new ticket to the state repo: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`).
3. Update `current-state.md` to reflect the new ticket: add or amend only the entries this change affects (leaving the rest of its existing content intact), so the snapshot stays accurate. Commit it: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).

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
```
