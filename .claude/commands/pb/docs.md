---
name: pb:docs
description: Invoke when documentation needs writing or updating (spec, testing manual, how-it-works, roadmap, user guide) outside of planning a feature. Writes or updates the relevant files in docs/, and queues work items in todo/ if the doc changes imply code or test changes. Keywords: docs, documentation, write docs, update docs, how-it-works, user guide, roadmap, README, document, keep docs current.
---

# pb:docs

Write or update documentation. Use this for documentation work that is not the design of a new feature (that is `pb:plan`).

## Steps

1. Ask the developer what documentation needs writing or updating.
2. Write or update the relevant files in `docs/` (spec, testing manual, how-it-works, or roadmap as appropriate).
3. If the doc changes imply code or test changes, create work items in `todo/` to cover them.

## Example

```
Developer: The how-it-works doc still describes the old single-process design.

Updated docs/how-it-works.md to describe the worker-pool architecture.
The doc now references a `MAX_WORKERS` setting that the code does not read yet,
so I queued todo/infra-5 to wire that config through.
```
