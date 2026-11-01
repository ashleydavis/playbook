# Ticket types

Each file here lists the stages a ticket of one type goes through in `in-progress/`, in order, and the instructions for each stage. `pb:next` reads the file named after the ticket's `**Type:**` in lowercase with spaces as hyphens (`Debug` is `debug.md`, `Test coverage` is `test-coverage.md`). The default type is Work: a Fix ticket, and any other type with no file of its own, uses [work.md](work.md).

- Each stage is run by its own sub-agent in the ticket's worktree.
- A stage starts when the one before it returns.
- No stage sends the ticket back to an earlier stage. Each fixes what it finds itself.
- The last stage moves the ticket out of `in-progress/`.

To give a type its own stages, add a file for it with one `## <stage>` heading per stage, in order, each followed by that stage's instructions as bullets.

## Every stage, whatever the type

- Reads the ticket (`index.md` and `detail.md`) and Verification and Evidence in the [pb:next](../../.claude/commands/pb/next.md) skill before it starts.
- Captures what it runs to the ticket's latest `evidence/implementation-N/`, and re-captures any earlier evidence its own changes make stale.
- Records in the ticket's History each fault it fixed and each decision it made.
- Leaves no process running (see Agent cleanup in the [pb:next](../../.claude/commands/pb/next.md) skill).
- Never runs `git`. The one exception is a Commit stage, which runs `git` only to commit.
