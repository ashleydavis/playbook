# <Project> setup

How to get <project> ready to run, test, and develop. Once set up, see [development.md](development.md) for the day-to-day workflow.

<!-- Keep this doc short and minimal: just what is needed to go from a fresh checkout to a working project, plus per-worktree setup. -->

## Prerequisites

- <Each tool that must be on `PATH` and how to install it: language runtime, package manager, test tools, etc.>
- <Any accounts, services, environment variables, or config files the project needs before it will run.>

## Set up the project

<The minimal commands to install dependencies and get a clean checkout ready to run.>

```sh
<dependency install command, e.g. npm install / bun install / pip install -r requirements.txt>
```

<If there is a single command to run the app, name it here.>

## Set up a worktree

<If each git worktree needs its own setup (its own installed dependencies, a build step, generated files), describe it here. If a worktree needs nothing beyond the shared checkout, say so plainly.>

**The implementation agent must set up the worktree before implementing a ticket.** From the worktree root, before compiling, testing, or running anything:

```sh
<per-worktree setup command, e.g. the dependency install>
```

<Explain what breaks if this is skipped, so the step is never skipped.>
