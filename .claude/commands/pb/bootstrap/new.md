---
name: pb:bootstrap:new
description: "Invoke once to set up a brand-new greenfield project under this process. Interviews the developer, creates the project repo from templates/project/ and the state repo from templates/state/, then interviews the developer about each template doc in turn and writes a good first version of every one (CLAUDE.md, setup, development, architecture, and the rules). Use when there is no existing code yet. Keywords: bootstrap, new project, greenfield, set up, scaffold, start a project, initialise, from scratch, create repos."
---

# pb:bootstrap:new

Bootstrap a greenfield project: create both project/ and state/ repos under the playbook repo, where Claude Code is launched, from the playbook templates, then interview the developer about each template doc so that every one has a good first version when bootstrap ends. The developer extends and iterates them afterwards. For an existing codebase, use `pb:bootstrap:existing` instead.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to bootstrap:

- Interview one question at a time.
- Report results as a short list: repos created, docs written, next step.

## Steps

1. Interview the developer, asking one question at a time:
   - What does the project do?
   - What is the tech stack?
   - What is the coding style?
   - How does testing work?
   - What other rules should the project conform to?
   - How is it deployed and how do I run it locally?
   - What other products does it look like? Ask for links to their web pages, as inspiration for the app's features and structure.

   - Which tools must be installed to build, run and test it (language runtimes, package managers, CLIs, test tools)? List them back as a short list and ask what is missing.

2. Create the project repo at `project/` under the playbook repo by copying [templates/project/](../../../../templates/project/). Leave the placeholders; step 5 fills them. Then fill `project/mise.toml` from the tools named in step 1: for each tool, run `mise latest <tool>` to find its latest version and pin that exact version under `[tools]`. Never type a version from memory. If `mise latest` cannot find a tool, say so and ask the developer for its mise name or a version. Run `mise trust && mise install` in `project/` to confirm the pins install, and report any that fail.
3. Create the state repo at `state/` under the playbook repo by copying [templates/state/](../../../../templates/state/) (tickets/ queues and the scoped CLAUDE.md files). Then **initialise it as a git repo** (`git init` in `state/`) and make an initial commit of the scaffolded contents (`scaffold state repo`). This makes the state repo's history an audit log; all subsequent state changes are committed automatically by the helper scripts or via `commit-state.ts` (see the **Queues** audit-log paragraph in `docs/process.md`).

4. Know the template docs. Each is a live doc: the developer keeps extending it after bootstrap, so write real content a reader can use, not a stub. They are covered in this order:
   1. `project/CLAUDE.md`
   2. `project/docs/setup.md`
   3. `project/docs/development.md`
   4. `project/docs/architecture.md`
   5. `project/docs/rules/coding-style.md`
   6. `project/docs/rules/testing.md`
   7. `project/docs/rules/documentation.md`

   The spec (`project/docs/spec/`) and testing manual (`project/docs/testing-manual/`) keep their template READMEs. Bootstrap does not author a spec or a testing manual upfront, and does not ask which docs to adopt.

5. For each doc in that order, run this loop:
   1. **Draft it first.** Fill the doc from the answers already given in step 1 and the earlier docs, reading each inspiration link first, and from anything the developer has pointed at (see "Examples" below). Fill only what those support. Never invent a detail to fill a gap.
   2. **Show the draft** in the reply, as the output format says.
   3. **Ask what is missing.** Ask the questions below that the draft could not answer, one at a time.
   4. **Ask for examples** relevant to this doc (see "Examples" below). The developer may skip.
   5. **Ask once what to do with the draft:** update it, replace it, or annotate it. Apply the answer.
   6. **Write the file.** No `<placeholder>` text is left behind. Where something is not decided yet, the doc says so in words (for example "Not decided yet.") so the developer can find and fill it later.

   Questions for each doc, beyond what step 1 already answered:
   - **`CLAUDE.md`**: What the project does and the stack come from step 1; the run commands come from the deploy and run answer. Ask for the constraints the design must never break, the command that runs every suite, and the environment variables and config files that change behaviour with their defaults.
   - **`setup.md`**: Which tools must be on `PATH`; they are pinned in `mise.toml` (made in step 2) and installed with `mise trust && mise install`, so list them from that file rather than asking again. Which accounts, services, environment variables or config files are needed before it runs. The install command. What each git worktree needs set up (its own installed dependencies, a build step, generated files), or whether it needs nothing.
   - **`development.md`**: How to start the app for development (hot reload, ports, environment variables). The top-level directory layout and what each directory holds. The command for each kind of test (type check or build, unit, the full suite, any others). The steps to add a feature end to end.
   - **`architecture.md`**: The major parts and what each owns and must not do. How the parts talk to each other. The doc includes a Mermaid diagram giving a high level overview of the project: draft it from the parts and how they connect, show it as a fenced `mermaid` block, and fix it from the developer's corrections. Where slow, heavy or blocking work runs and where it must never run, and any task system or queue involved. One typical user action walked through the parts. The key design decisions, with the alternatives rejected and why. The constraints the design must never break. For each similar product the developer linked, what the app takes from it (features, structure, behaviour) and where it will differ.
   - **`rules/coding-style.md`**: Naming, formatting, file layout and language idioms, on top of the answer to the coding style question. Whether the minimalism defaults stay.
   - **`rules/testing.md`**: The runners, how to run each suite, and the layout of test files. Which kinds of test are required and when (unit, smoke, end to end), on top of the answer to the testing question. Whether the screenshot rules for UI changes stay as they are.
   - **`rules/documentation.md`**: Which documents are required and must be kept current. For a required document the template does not ship (for example a user guide), ask whether to keep requiring it, and if so write a first version of it from the answers so far. Any other standing documentation rules, on top of the answer to the other rules question.

   Other rules from the "other rules" answer go to whichever rule file fits, or a new file under `project/docs/rules/` for a rule category that has none yet. Refine the rules anytime with `pb:customize`.

6. Begin the development loop (typically `pb:status` to confirm the empty state, then plan the first feature with `plan:create` and `pb:plan:break`).

## Examples

Examples make a doc concrete. At each doc, ask the developer for any that apply: a snippet of code written the way they want it, a snippet to avoid, a command and its output, a file path, a sample test, or a link. A link may point to a repo, a file, a doc or a page. When the developer gives one, read it (clone or fetch it when it is a link) and use it in the draft, quoting the example in the doc where it helps a reader. A link to an existing project may be offered as the model for the new one (its testing, workflow, build process and so on). Read it once, then use what it shows in every doc it applies to, and say which parts you took from it. A link may come with an instruction, such as "add this to my project setup". Read the link first, then apply the instruction in the doc it belongs to (for a tool to install, the prerequisites and install steps in `setup.md`, and the matching commands in `development.md`). If a link cannot be read, say so and ask for another way to see it. Never write down what a linked thing contains without reading it.

## Example

```
Building: a markdown note-taking CLI. Stack: TypeScript + Bun. Tests: Bun test + smoke scripts.
Run: `bun run notes`.

Created project/ (from templates/project/)
Created state/ (from templates/state/, queues empty)
Wrote first versions of: CLAUDE.md, docs/setup.md, docs/development.md, docs/architecture.md, docs/rules/{coding-style,testing,documentation}.md
Next: plan the first feature with plan:create, then pb:plan:break to queue tickets.
```

## Next

Recommend the developer run:
- `pb:status`: confirm the empty state.
- `plan:create` then `pb:plan:break` (or `pb:add` / `pb:docs`): to put the first work into `todo/`.
