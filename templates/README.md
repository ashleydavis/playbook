# Templates

Every template the process uses: the repo scaffolds copied into new projects at bootstrap, the per-item shapes copied when creating features and work items, and the commit template.

`pb:bootstrap:*` copies `project/` and `state/` into a new project and fills the placeholders from the interview. The item templates (`feature-template/`, `work-item-template/`) sit beside the scaffolds, not inside them: they are references, not part of any repo. `pb:plan` and `pb:add` copy their shape when creating individual features and work items in a project. `commit-template.txt` is a reference for the commit message format.

Updates to these templates do not propagate to existing projects automatically; a project opts in by re-running the relevant bits of bootstrap.

See [index.md](index.md) for the full list of what lives where.
