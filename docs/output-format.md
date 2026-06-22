# Output format

The project's standard for how a skill presents output to the developer. Each skill links here and may add its own local tailoring on top. Read this once per session; if it is already in your context, do not load it again.

- Bullet points, not prose. No preamble, no narrating what you are about to do, no restating instructions back.
- One fact per bullet. Lead with the concrete thing: an action (Open, Run, Look at), a ticket, or a result.
- Report state and next steps. Do not editorialise or pad.
- Plain English only. No jargon or made-up terms; use the project's terms from `glossary.md`.
- Never write a paragraph where a list works.
- **Show content in the reply itself.** When the developer asks to see a file, diff, doc, or output, paste it into your message as a fenced code block (images rendered inline). Running a command to produce it (`git show`, `git diff`, `cat`, `Read`, a test run) does **not** count as showing it: command output and terminal scrollback are not your reply and may never be seen. Paste the actual content; for a brand-new file paste the file, not a `+`-prefixed diff. Lead with the content and summarise after, if at all. If the developer says they did not see it, re-send it inline rather than pointing back at the command.
- Interactive ticket menus follow [ticket-selection.md](ticket-selection.md); skills that ask the developer to pick ticket(s) link both this file and that one under **Output style**.
