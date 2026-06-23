# Testing

<Project-specific test setup: runners, how to run each suite, layout.>

## Testing rules

These apply to every change.

- Always write unit tests for new behaviour.
- **A UI-affecting change must be screenshotted in every affected view, in both light and dark mode.** Agent review rejects a UI-affecting change with no screenshots. A removal is a UI change too: capture the resulting after-state.
- **A new or changed UI component must be screenshotted even before any page consumes it.** If no page renders it yet (its consumers arrive in later tickets), render it **in isolation** (a scratch render or story mounting it with sample props, covering each distinct state including any null/empty case) and screenshot it in light and dark. "No page consumes it yet", "not wired in", "nothing to render", and "the e2e ticket covers it later" are not valid reasons to skip a component's screenshots. A component ticket may not declare its Test Plan `N/A` on the grounds that it has no consumer yet.
- <Other required tests and when they apply.>