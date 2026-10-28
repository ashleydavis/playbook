# render-diagrams.sh

Renders Mermaid diagram files to PNG images for the docs. The images are committed so GitHub shows exactly what was rendered locally: GitHub's own Mermaid lays diagrams out with a different engine and ignores their spacing settings.

## Usage

```bash
bash scripts/render-diagrams.sh <file.mmd> [<file.mmd> ...]
```

- `<file.mmd>`: a Mermaid diagram file. Each one is rendered to a `.png` with the same name beside it, overwriting any earlier render. Pass as many as you like.

Run with no arguments, it prints its usage.

To re-render every diagram in the docs:

```bash
bash scripts/render-diagrams.sh images/*/*.mmd
```

## What it does

- Renders with mermaid-cli, pinned to an exact version, in Mermaid's dark theme on a dark background (`#0d1117`), because the docs that show the images are designed to be viewed in dark mode.
- Renders at twice the size, so the text stays sharp when GitHub shrinks a wide diagram to the page width.
- Starts headless Chrome with `--no-sandbox` (set in `render-diagrams.puppeteer.json`), because Ubuntu 23.10 and later block Chrome's sandbox.

## Needs

- Bun, for `bunx`. The first run downloads mermaid-cli and a headless Chrome.

After editing a `.mmd` file, re-render it and commit the `.mmd` and the `.png` together.
