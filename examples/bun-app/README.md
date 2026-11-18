# bun-app — a Bun project with its own board

A tiny Bun service whose kanban board lives beside the code in [`board/board.md`](board/board.md).

```sh
bun install
bun run board    # opens board/board.md in the app, served from localhost
bun start        # the app itself
```

`bun run board` uses the [`@pritzlaff/agile`](https://www.npmjs.com/package/@pritzlaff/agile) dev
dependency. **Save** (Ctrl/⌘ S) writes your edits back to `board/board.md`; reload the page to pick up
edits made in your editor. No install? `bunx @pritzlaff/agile board/board.md` does the same.

## Badge and summary card

```sh
make snapshot    # → board/badge.svg and board/card.json
```

- `badge.svg` is a status badge for your README:
  `[![Board](https://you.github.io/your-app/badge.svg)](https://you.github.io/your-app/)`
- `card.json` is the same summary as data (title, status pill, done/total, a count per column, a link)
  for a dashboard to style as it likes.

Both follow the badge settings in `board.md`. To choose which columns show, their symbols, icons and
colors, open the board (`bun run board`), click the badge at the top of the ☰ menu, preview the badge and
card there, then **Save** and run `make snapshot` again.

The card links to the hosted app on your published `board.md`
(`…?src=https://you.github.io/your-app/board.md`). `make` works that URL out from your `origin` remote;
override it with `make snapshot AGILE_SRC=<url>`, and point the link at another copy of the app with
`AGILE_HOST=<url>` (the same address as `VIEWER` in `board/index.html`).

## Publishing on GitHub Pages

`.github/workflows/pages.yml` runs `make snapshot` and publishes only the `board/` folder. Its
`index.html` redirects to the hosted app with `?src=` pointing at your `board.md`, as in
[acme-sprint](../acme-sprint). On GitHub: Settings → Pages → Source: **GitHub Actions**.

Live copy of this example:
[aaronp.github.io/agile/?src=examples/bun-app/board/board.md](https://aaronp.github.io/agile/?src=examples/bun-app/board/board.md)
