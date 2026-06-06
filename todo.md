# Todo

- Be cool if there different interviews for different types of projects.
- Be cool to set the CC status bar to show an overview of current state.
- /status command is already used. Need a better name.
- Review output of /pb:help
- The state repo actually needs to be commited after each change so we can see the history. Make the process manage it.
- I'm going to need some kind of audit log to understand what has happened. Another script can do this.
- Needs skills to list queues.
- Need a reset skill. Moves in prog work back to todo, deletes worktrees and branches.
- /goal doesn't seem to be set for the parent agent by /next
    - Possibly not set for subagents either.
- Some tasks take way longer than others and the parent agent won't start new tasks. Maybe part of the goal should be to keep 10 tasks in flight as long as possible. Like when any task completes try and replace it with another (assuming deps are satisfied).