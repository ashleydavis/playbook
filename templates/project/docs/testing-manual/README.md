# Testing manual

Step-by-step manual testing guides for the app. This directory mirrors `docs/spec/` exactly: the same subdirectory layout, the same feature IDs, and an `index.md` in every directory.

## Layout

Where the spec has `detail.md` (the full spec), the testing manual has `detail.md` (the full manual test steps for that feature). So `docs/spec/<feature>/detail.md` has a matching `docs/testing-manual/<feature>/detail.md`.

Each feature directory contains two files:
- `index.md`: lightweight surface. ID, brief description, and a list of sub-features.
- `detail.md`: the full manual test steps for that feature.

The `index.md` at this top level is the central index of manual test guides.

## Keeping it in sync

The testing manual mirrors the spec. When the spec structure changes (a feature added, renamed, or removed), make the matching change here. A feature in `docs/spec/<id>/` must have a corresponding `docs/testing-manual/<id>/`.