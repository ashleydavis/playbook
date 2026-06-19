# <Project> development guide

This guide covers everything needed to develop, test, and contribute to <project>. For an overview of what <project> does and how to run it as a user, see the [readme.md](../readme.md). For setup, see [setup.md](setup.md). For the detailed architecture, see [docs/architecture.md](architecture.md).

<!-- This template mirrors the structure of a full development guide. Replace every <prompt> with your project's real details, and delete any section that does not apply. -->

## Prerequisites

<List the tools, services, and accounts a developer needs. Full install instructions live in [setup.md](setup.md); summarise and link rather than duplicate.>

## Setting up

See [setup.md](setup.md) for prerequisites and the full setup, including per-worktree setup. In short:

```sh
<dependency install command>
```

## Running in development

<How to start the app for development (hot reload, ports, any env vars). Name the command and what it launches.>

## Project structure

```
<A tree of the top-level directories and what each holds.>
```

## Testing

<How to run each kind of test the project has, one short subsection each.>

### Type checking / build

```sh
<compile or typecheck command>
```

### Unit tests

```sh
<unit test command>
```

### All tests

```sh
<command that runs the full suite (compile, unit, integration, e2e) in sequence>
```

<Add subsections for any other suites (smoke, e2e, etc.) with the command to run each and what it covers.>

## Code conventions

<The naming, formatting, module-style, and language rules the codebase follows. Keep this aligned with `docs/rules/coding-style.md`.>

## Adding a new feature

<The step-by-step a developer follows to add a feature end to end: where to start, what to change in order, which tests to write, and which docs to update.>

## Related docs

- [setup.md](setup.md): how to set up the project and a worktree.
- <Other key docs (architecture, api, testing manual, etc.) with a one-line description each.>
