# Testing

<Project-specific test setup: runners, how to run each suite, layout.>

## Testing rules

These apply to every change.

- Always write unit tests for new behaviour.
- **A UI-affecting change must be screenshotted in every affected view, in both light and dark mode.** Agent review rejects a UI-affecting change with no screenshots. A removal is a UI change too: capture the resulting after-state.
- **Screenshots are taken in the context of the running app.** Every required screenshot must show the change inside the running app, in its real shell (top navbar, left sidebar, and surrounding chrome present), reached the way a user reaches the view. Do **not** screenshot a component rendered in isolation (a gallery, scratch render, or story) when the component is reachable in the app. Isolation rendering is permitted **only** as the fallback in the next rule, for a component no page consumes yet; the moment a page renders it, its screenshots must come from the running app.
- **A new or changed UI component must be screenshotted even before any page consumes it.** If — and only if — no page renders it yet (its consumers arrive in later tickets), render it **in isolation** (a scratch render or story mounting it with sample props, covering each distinct state including any null/empty case) and screenshot it in light and dark. "No page consumes it yet", "not wired in", "nothing to render", and "the e2e ticket covers it later" are not valid reasons to skip a component's screenshots; they are also the only grounds for capturing in isolation rather than in the running app. A component ticket may not declare its Test Plan `N/A` on the grounds that it has no consumer yet.
- <Other required tests and when they apply.>