# Spec

This directory is the source of truth for how the app works. Every feature has a subdirectory here.

## Layout

Each feature directory contains two files:
- `index.md`: lightweight surface. ID, status fields, brief description, and a list of sub-features.
- `detail.md`: the full spec. Overview, behaviour, acceptance criteria, open questions.

Sub-features are nested subdirectories using the same two-file pattern. There is no depth limit.

The `index.md` at this top level is the central index of all top-level features.

## IDs

Every feature declares an `**ID:**` field in its `index.md`. IDs are flat kebab-case tokens (no slashes), globally unique. The ID in the file is the source of truth, not the directory path.

## Status fields

Each feature `index.md` declares two fields:
- `**Spec:**` is `Draft` (still being written or has open questions) or `Settled` (ready to build against).
- `**Implementation:**` is `None`, `Partial`, or `Complete`. It rolls up the checkboxes in the `detail.md` acceptance criteria.

A retired feature adds a `**Deprecated:**` field with the date or reason.

## Adding a feature

1. Pick an ID. Make sure it is unique across the spec.
2. Create the directory `docs/spec/<id>/` (or a nested location for a sub-feature).
3. Add `index.md` with the ID, status fields, brief description, and an empty Sub-features section.
4. Add `detail.md` with the full spec (overview, behaviour, acceptance criteria as checkboxes, open questions).
5. Add an entry for the new feature to the parent index (`docs/spec/index.md` for top-level, or the parent feature's `index.md` for a sub-feature).
6. Mirror the structure under `docs/testing-manual/<id>/` with `index.md` and `detail.md`.
