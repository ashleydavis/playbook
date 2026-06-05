# Work items

This directory holds the project's work-item queues. Each queue is a directory, and each work item is a directory named by its ID sitting directly under a queue:

```
todo/
  user-auth-1/        # Named by the work item's ID
    index.md          # The work item itself
    evidence/         # Captured proof (optional, added once proof exists)
```

The queues are flat: item directories sit directly under the queue with no nested hierarchy. The whole item directory moves between queues as a unit, so the item and its proof always travel together and land self-contained in `done/<id>/`.

## Queues

- `todo/` — Pending work items. New items always start here.
- `in-progress/` — Items currently being implemented.
- `agent-review/` — Items awaiting automated review.
- `human-review/` — Items awaiting developer review.
- `merge-queue/` — Approved items waiting to merge.
- `done/` — Completed items (immutable history).

## ID rule

A work item's ID is declared in the `**ID:**` field inside its `index.md`; the directory name mirrors it by convention, but the field is the source of truth. Because the directory name mirrors the ID, listing a queue enumerates the IDs of every item in that queue without opening any file.
