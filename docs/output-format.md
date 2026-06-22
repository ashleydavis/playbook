# Output format

The project's standard for how a skill presents output to the developer. Each skill links here and may add its own local tailoring on top. Read this once per session; if it is already in your context, do not load it again.

- Bullet points, not prose. No preamble, no narrating what you are about to do, no restating instructions back.
- One fact per bullet. Lead with the concrete thing: an action (Open, Run, Look at), a ticket, or a result.
- Report state and next steps. Do not editorialise or pad.
- Plain English only. No jargon or made-up terms; use the project's terms from `glossary.md`.
- Never write a paragraph where a list works.
- **Show content in the reply itself.** When the developer asks to see a file, diff, doc, or output, paste it into your message as a fenced code block (images rendered inline). Running a command to produce it (`git show`, `git diff`, `cat`, `Read`, a test run) does **not** count as showing it: command output and terminal scrollback are not your reply and may never be seen. For a brand-new file paste the file, not a `+`-prefixed diff. If the developer says they did not see it, re-send it inline rather than pointing back at the command.
- **Show only — nothing trailing.** When the developer asks to be *shown* something, output the artifact and stop. Do not follow it with a description of what it contains, a recap, an analysis, a verdict, or a summary — none of it. They asked to see it, not to be told about it, and composing that commentary is also what makes them wait. In a driven loop (`pb:review`) the artifact is followed only by the next action prompt. A verdict is never yours at the human-review gate. Single exception: if evidence the gate genuinely requires is absent (e.g. a both-mode screenshot of an affected view is missing), you may flag that in one short line — never a general write-up.
- Interactive ticket menus follow [ticket-selection.md](ticket-selection.md); skills that ask the developer to pick ticket(s) link both this file and that one under **Output style**.
