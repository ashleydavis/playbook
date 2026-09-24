---
name: pb:platforms
description: "Invoke to set or clear **Platforms:** on tickets in todo/ or backlog/. A ticket locked to platforms is admitted to in-progress/ by pb:next only on one of those platforms; a ticket with no platforms runs anywhere. Lists tickets across both queues as one numbered menu. Keywords: platforms, platform, lock to platform, linux, darwin, macos, win32, windows, clear platforms, any platform, run on."
---

# pb:platforms

Set or clear `**Platforms:**` on tickets in `todo/` or `backlog/`. Platform names are Node's `process.platform` values: `linux`, `darwin` (macOS), `win32` (Windows). `pb:next` admits a locked `todo/` ticket to `in-progress/` only when it runs on one of the ticket's platforms. `any` clears the lock, so the ticket runs anywhere.

## Output style

Follow the project's [output format](../../../docs/output-format.md) and [ticket selection menu](../../../docs/ticket-selection.md) (load once per session if not already in context). Mode: **`pick-many`**.

## Steps

1. Run `(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-many --queue todo --queue backlog --prompt 'Which ticket(s) to set platforms on? (number, several numbers, ticket ID, or "all")')`. If every section is empty, say so and stop.
2. Print the script output verbatim and wait for the developer's pick. Resolve the selection per [docs/ticket-selection.md](../../../docs/ticket-selection.md).
3. For each selected ID, ask which platforms it can run on (e.g. `linux, darwin`), or `any` to clear. One question per ticket, unless the developer gives one answer for all selected.
4. For each ID, run `(cd state && bun ../scripts/set-platforms.ts <id> <platforms|any>)`, passing the platforms comma-separated. The script rejects an unknown platform; if it does, ask again. Each call auto-commits its ticket-scoped change.
5. Report each ticket's new platforms.

## Example

```
platforms: auth-9, darwin
platforms: search-1, any
```

## Next

Recommend the developer run:
- `pb:next`: to pick up actionable `todo/` tickets for this platform.
