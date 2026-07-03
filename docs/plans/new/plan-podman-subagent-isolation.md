# Podman-per-subagent Isolation for pb:next (under Multipass)

## Overview

Today `pb:next` drives the whole loop inside **one** boundary: a Multipass VM with permissions off. Up to 10 implement sub-agents run in parallel, plus agent-review and a merge-train sub-agent, and they all share that single VM. Each ticket's only per-ticket boundary is its **git worktree** (`project/worktrees/<id>`), which is filesystem-only. This is why `next.md` carries an elaborate "kill every long-lived process you start" discipline: parallel worktrees share default ports (`EADDRINUSE`), collide on dependency state, and leak watchers/servers.

This plan adds a **second, inner isolation layer**: a **podman container per sub-agent worktree**, so every parallel ticket gets its own filesystem, PID, and network namespace. Per-container namespaces remove the shared-port collision class at its root and subsume the manual process-kill discipline (`podman rm -f` reaps every process, port binding, and watcher in one call). The outer Multipass VM layer is also scripted end to end.

Scope decisions (locked):
1. A **wrapper script** `ticket-exec.ts` routes worktree commands into the container; sub-agents never touch podman directly.
2. **All** worktree stages are containerized: implement (parallel, up to 10), agent-review, and the merge-train check.
3. A **project Containerfile** (templated) provides the image, built once per run.
4. The **Multipass layer is scripted** via a new `vm-up.sh`.

Podman is **opt-in per project** via a committed config file. With it off (the default), every script behaves exactly as today, so non-container projects are unaffected.

**Key model — identical-path root mount.** Each container bind-mounts the **entire playbook root at the identical absolute path**, workdir = the ticket's worktree. This is required because:
- Worktree `.git` links are **relative** (`git worktree add --relative-paths`) and resolve only if the worktree and `project/.git` keep the same relative offsets — guaranteed by mounting the whole tree that contains both.
- Sub-agents move tickets with `bun ../scripts/move.ts`, reaching into sibling `state/` and `scripts/`, outside `project/`.
- Scripts and sub-agents use **absolute paths everywhere** (`git -C <abs>`, `resolve(...)`), so identical-path mounting makes host-computed and container-computed paths interchangeable.

**The split:** worktree work (setup/compile/lint/test/run/screenshot) runs **in the container** via `ticket-exec`; state moves (`move.ts`, `fail-ticket.ts`) run **on the host/VM** so git-commit identity, lock-retry, and the parent's reconciliation stay in one place. Memorable form: **worktree work → container; state moves → host.**

All new TypeScript mirrors the repo's established idioms: an injectable runner defaulting to a real implementation (like `GitRunner`/`realGit`), a typed `*Error` mapped to a clean non-zero exit, an exported pure core plus a thin CLI wrapper guarded by `process.argv[1] === __filename`, and a paired Jest `*.test.ts` (fake runner) plus `smoke-*.sh` (real, throwaway repos, gated on `command -v podman`).

## Issues
<!-- Leave empty, populated later by plan:check -->

## Steps

1. **Config mechanism (do first — everything reads it).** Add `project/.pb-podman.json`, a committed (not gitignored) toggle so it travels with the project:
   ```json
   { "enabled": true, "image": "pb-project-image" }
   ```
   A missing file or `enabled:false` means **podman is off** — the guard that preserves today's behaviour. New lib `scripts/lib/podman-config.ts` (+ `podman-config.test.ts`):
   - `PodmanConfig { enabled: boolean; image: string }`.
   - `readPodmanConfig(projectDir)` — best-effort; returns `{ enabled:false, image:"" }` on a missing/malformed file (must never throw and break the loop).
   - `containerName(id)` → `` `pb-${id}` `` (single source of the naming scheme; the merge train's `trainId` is already `merge-<random>`, yielding `pb-merge-<random>`).

2. **The podman runner — `scripts/lib/podman.ts`** (+ `podman.test.ts`), mirroring `lib/worktree-teardown.ts`: injectable `PodmanRunner`/`realPodman` (`Bun.spawn(["podman", ...args])`), `PodmanError`, and guarded/idempotent primitives — `imageExists`, `buildImage(image, contextDir)` (`podman build -t <image> -f <contextDir>/Containerfile <contextDir>`), `containerExists`, `ensureContainer(name, image, playbookRoot)`, `removeContainer(name)` (treat "no such container" as success), `removeAllTicketContainers()` (list + force-remove `pb-*`). Exact create shape:
   ```
   podman run -d --name pb-<id> \
     -v <playbookRoot>:<playbookRoot>:Z \
     -w <playbookRoot>/project/worktrees/<id> \
     --userns=keep-id <image> sleep infinity
   ```
   `--userns=keep-id` maps container user → host UID so worktree/evidence/state writes are host-owned (no root-owned artifacts, no commit-permission failures). `:Z` relabels for SELinux (needed on Fedora/RHEL, harmless on Ubuntu). `sleep infinity` keeps it long-lived so `podman exec` reuses it across a whole stage. `playbookRoot = resolve(stateDir, "..")`.

3. **The wrapper — `scripts/ticket-exec.ts`** (+ `ticket-exec.test.ts`, + `smoke-ticket-exec.sh`). Usage `bun ../scripts/ticket-exec.ts <id> -- <cmd...>` from `state/`. Reads config; when **disabled** it is a transparent passthrough running the command directly with cwd = worktree (so `next.md` can say "always route through ticket-exec" with no branch); when **enabled** it runs `podman exec -w <worktreePath> pb-<id> bash -lc "<cmd>"` (login shell so the image's toolchain PATH is present). It **streams** stdout/stderr (inherit) per the verification rule and **propagates the exit code** so a failing check is a failing `ticket-exec`. `TicketExecError` for the missing-`--` case. Evidence still lands in `state/tickets/<id>/evidence/...` because that tree is the same inode inside and out; capture on the host side (redirect `ticket-exec`'s output) so evidence handling is identical to today.

4. **The image scaffolds.**
   - `templates/project/Containerfile` — templated (same `<placeholder>` style as `templates/project/docs/setup.md`): `FROM <base>`, `<install project toolchain + headless-browser deps for screenshots>`, and a **mandatory** `RUN <install git> && git config --global --add safe.directory '*'` (neutralises git's cross-boundary dubious-ownership guard). No app source (worktree is bind-mounted live); no CMD (run command supplied).
   - `templates/project/.pb-podman.json` — shipped **disabled** (`{ "enabled": false, "image": "pb-project-image" }`) so a freshly bootstrapped project is unchanged until the developer opts in. `image` must be unique per project on a shared VM.

5. **`scripts/setup-ticket.ts`** — extend core `setupTicket()` with an injectable `runPodman: PodmanRunner = realPodman` param (keeps the unit test podman-free). After the worktree exists, when `cfg.enabled`: build the image once (`if (!imageExists) buildImage(cfg.image, projectDir)` — context is `projectDir`, where the Containerfile lives), then `ensureContainer(containerName(id), cfg.image, playbookRoot)` (idempotent). Return the container name in `SetupResult`; `main()` logs `container pb-<id>` (or `(podman off)`). Update `setup-ticket.test.ts` (fake runner: build-once short-circuit, ensure argv, disabled path = no podman calls) and `smoke-setup-ticket.sh` (podman-gated block asserting `git -C <worktree> status` succeeds **inside** `pb-<id>` — proves the relative-link + identical-path model end to end).

6. **Teardown at every site** (attach `removeContainer`; keep `lib/worktree-teardown.ts` a pure git primitive):
   - `scripts/lib/conclude-ticket.ts` — in `concludeTicket()`, after `removeWorktreeAndBranch()`, also `removeContainer(containerName(id), runPodman)` under the same best-effort try/catch → `teardownWarning`. Covers both merge `land` and Debug `conclude-debug.ts`. Add injectable `runPodman`, guarded by config. Update `conclude-ticket.test.ts`.
   - `scripts/merge-ticket.ts` — the merge-train check runs in a container too. After `buildTrain()` creates `worktrees/<trainId>`, when `cfg.enabled` build/ensure `pb-<trainId>` (same image, identical root mount, workdir = train worktree); the merge sub-agent runs post-merge checks via `ticket-exec.ts <trainId> -- <checks>` (no special-casing — `trainId` is just an id to `ticket-exec`). `discardTrain()` also `removeContainer(containerName(trainId), runPodman)` (covers post-land cleanup and bisect discard). Update `merge-ticket.test.ts` + `smoke-merge-ticket.sh`.
   - `scripts/reset-loop.ts` — after the worktree-removal loop, when `cfg.enabled` call `removeAllTicketContainers(runPodman)` to force-remove **every** `pb-*` (a container can outlive a hand-deleted worktree). Add injectable `runPodman`. Update `reset-loop.test.ts` + `smoke-reset-loop.sh`.
   - `scripts/conclude-debug.ts` — no code change (it calls `concludeTicket()`); add a podman-gated assertion to `smoke-conclude-debug.sh` that `pb-<id>` is gone after conclusion.

7. **VM + prereqs layer.**
   - New `scripts/vm-up.sh` (+ `smoke-vm-up.sh`, gated on `command -v multipass`) — idempotent Multipass bring-up in `install-prereqs.sh`'s defensive style (`set -euo pipefail`, `have`/`info`/`warn`). `multipass launch` only if `multipass info` fails (`--name`/`--cpus`/`--memory`/`--disk`, Ubuntu LTS), then `multipass mount "$HOST_PLAYBOOK" "$NAME:$HOST_PLAYBOOK"` at the **identical absolute path** (host path == VM path == in-container path), then `multipass exec "$NAME" -- bash "$HOST_PLAYBOOK/scripts/install-prereqs.sh"`. Guard each step so re-running converges. No Jest test (pure bash orchestration, like `install-prereqs.sh`).
   - `scripts/install-prereqs.sh` — add a **rootless podman** block after the bun/claude blocks, same idempotent `have podman || install` style: `apt-get install -y podman`; ensure `/etc/subuid`+`/etc/subgid` ranges for the run user; `loginctl enable-linger "$USER"` so `sleep infinity` containers survive the launching shell; end with `podman info` confirming rootless (warn, don't hard-fail, so a host-only user still gets git/bun/claude).

8. **`.claude/commands/pb/next.md` prose edits.**
   - Implement, agent-review, and merge post-merge-check steps: change "run the project's worktree setup … then compile/test in the worktree" to "**route every worktree command through `bun ../scripts/ticket-exec.ts <id> -- <cmd>`**, which runs it inside the ticket's podman container (own filesystem, PID, network namespace), including the `project/docs/setup.md` per-worktree setup, compile, lint, test, and run/screenshot." Note the container/image are created by `setup-ticket.ts`, so sub-agents never touch podman directly.
   - Setup-failure rule: unchanged in spirit — a failed setup inside the container is still a hard block → `blocked/`; an image-build or container-start failure is handled the same way.
   - Agent cleanup: rewrite the "kill every long-lived process" paragraph — the container owns the PID/network namespace, so `podman rm -f pb-<id>` (done automatically by every teardown path) reaps every server, watcher, and port binding; the sub-agent no longer tracks PIDs but must still **leave the worktree git-clean** (unchanged). The parent's end-of-turn reaper changes from "kill any process rooted under `project/worktrees/`" to "force-remove any stray `pb-*` container left by a dead sub-agent."
   - State moves: state explicitly that `move.ts`/`fail-ticket.ts` run **on the host**; only worktree commands go through `ticket-exec`.

9. **Docs.**
   - `docs/decisions.md` — new dated entry at top (newest first): files changed, the config mechanism, and the why (per-container PID/network isolation removes the shared-port collision class and subsumes manual process-kill; identical-path root mount required by relative worktree links + absolute-path scripts).
   - `docs/process.md` — extend Setup with the `vm-up.sh` one-liner + podman prereq; add a short **Containers** subsection (config toggle, `ticket-exec`, the container/host split, teardown; opt-in).
   - `handbook.md` — expand the "Sandbox VM (Multipass or similar)" section with a **Per-ticket containers** subsection (bind-mount model, why identical paths, `pb-<id>` naming, `sleep infinity` reuse, teardown, merge-train container) and add `vm-up.sh` to the setup steps.
   - `glossary.md` — add **Ticket container**, **Containerfile**, **ticket-exec**.
   - `scripts/CLAUDE.md` — list `ticket-exec.ts`, `vm-up.sh`, `lib/podman.ts`, `lib/podman-config.ts`.
   - `templates/project/docs/setup.md` — add a "Container image" note pointing at the `Containerfile` + `.pb-podman.json`; clarify the per-worktree setup command is what `ticket-exec` runs inside the container.

10. **Tests + verification.**
    - Unit (Jest): every new/changed `.ts` gets a fake `PodmanRunner` injected (like `GitRunner`/`realGit`) so tests never invoke real podman. Assert exact argv (`run -d --name … -v root:root:Z --userns=keep-id … sleep infinity`, `exec -w … pb-<id> bash -lc`, `rm -f`, `image exists`/`build`), idempotency short-circuits, the disabled-config passthrough, and exit-code propagation.
    - Smoke (bash): each podman-touching smoke test gates on `command -v podman >/dev/null || { echo "SKIP (no podman)"; exit 0; }`, then exercises the real container path against a throwaway repo + a temp `.pb-podman.json`. Key end-to-end assertion: create a ticket container and run `git -C <worktree> status` inside it successfully. `smoke-vm-up.sh` gates on `command -v multipass`.
    - Run `bun run compile`, `bun run test`, `bun run smoke` from `scripts/` and fix all failures.
    - End-to-end: `bash scripts/vm-up.sh`; in the VM bootstrap a tiny project, fill `project/Containerfile`, set `.pb-podman.json` `enabled:true`; `setup-ticket.ts <id>` builds the image once and starts `pb-<id>`; `ticket-exec.ts <id> -- hostname` returns the container id; `/pb:next` runs all checks in containers with `podman ps` showing up to 10 `pb-*` plus a `pb-merge-*`; after land/conclude/reject/reset `podman ps -a --filter name=pb-` is empty; flip `enabled:false` and re-run for identical-to-today behaviour with zero podman calls.

## Risks

- **Rootless podman in Multipass:** needs `subuid`/`subgid` ranges + lingering (handled by `install-prereqs.sh`); cgroups v2 required (Ubuntu 24.04 fine); no nested virtualization needed.
- **Nested-mount performance / `:Z` cost:** the whole root is bind-mounted through host→VM→podman; deep `node_modules` installs can be slow and `:Z` relabels on first mount. Accept the one-time relabel; keep heavy deps in container layers where possible.
- **`safe.directory` mandatory** in the Containerfile — a project overriding the base image without it breaks git-in-container.
- **Dev-server port viewing:** an in-container server binds the container's localhost, invisible to the host; in-container headless screenshots work, but eyeballing a live server would need an optional `--publish` (out of scope). This same isolation is what removes the `EADDRINUSE` collisions.
- **Shared-VM config drift:** two projects with the same `image` tag collide; `image` must be unique per project (documented in `.pb-podman.json`).
