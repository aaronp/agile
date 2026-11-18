# Agile board

**[▶ Open the board](https://aaronp.github.io/agile/)** ·
[Acme example](https://aaronp.github.io/agile/?src=examples/acme-sprint/board.md)

A kanban board driven by **one markdown file**: columns, tasks, their owners, tags, history and the board's
style. This repo is the app. Your board can live in its own repo and be loaded with `?src=` (see
[Publishing your own board](#publishing-your-own-board)).

- **Board**, **Split** (board beside its markdown), **Archive** and **Markdown** views.
- The **☰ menu** holds **New**, **Open**, **Save**, **Download**, **Copy link** and **Style**.
- **Copy link** copies a URL with the whole board compressed into it (`#board=…`, deflate + base64url), plus the current view and filters. Opening it shows that board without overwriting the one saved in that browser, and edits to it update the `#board=` in the address bar; it lives in the hash, so it never reaches the server. Links over 2000 characters copy with a warning, since some apps cut them.
- **Badge and card**: the top of the ☰ menu shows an SVG badge of task counts, like `B: 4 📋 | P: 2 ⏳ | D: 7 ✅`. Click it to choose which columns it shows, each with a symbol (up to 6 characters), an icon and a color (saved in the file as `badge:` in the front matter), and to download or copy the badge and `card.json`. `card.json` is the board as data for a dashboard: title, a status pill (`3 open` or `All done`), done/total, and a count per badge column in the badge's colors; the dialog previews it. In CI, `agile badge` and `agile card` write the same files (see [Using it in a project](#using-it-in-a-project)).
- **New** starts a blank board (To Do, Doing, Done) in the current style, after asking, since it replaces the board saved in this browser.
- **Child tasks**: the **+** on a card (on hover) or **Create child task** in the task panel adds a task under it, nested as deep as you like. Children sit indented beneath their parent with a connecting line; one moved to another column shows "↳ parent", and leaves a dotted stand-in under the parent that jumps to it. The chevron on a parent folds its children away. Saved as `- parent: t-03`.
- **History** (the clock beside Undo / Redo): a time slider with a step for every move in the tasks' history, archived ones included. It shows the board, archive and markdown as they stood then, read-only; **Now** returns to the live board. It's replayed from each task's `history:`, so deleted tasks don't appear, columns since renamed come back under their old names, and titles, tags and descriptions are today's.
- **Undo / Redo** (↶ ↷, or Ctrl/⌘ Z and Ctrl/⌘ Shift Z / Ctrl Y) step back through every change, up to 100. Typing in one field counts as one step; opening a board or starting a new one clears the history.
- **Open**: drop a `.md` file, choose one, open one from a URL (GitHub file links work) or pick a recent one.
- **Save** (Ctrl/⌘ S) writes a board served by `make dev` or the `agile` command back to its file. Otherwise
  it writes to a file you pick once, then to the same file each time; browsers without a file picker
  (Firefox, Safari) download it instead. **Download** always downloads `<title>.md`.
- Nine styles (Minimal, Paper, Terminal, Ocean, Ball pit, plus Graph paper, Night shift, Blueprint and Warm ledger from [Decision Ledger](https://aaronp.github.io/adr/)), with their settings stored in the file.

Edits are saved in this browser (localStorage), except for a board opened from a URL. **The `.md` file is the
real copy**, so keep it in git.

| Query | Shows |
| --- | --- |
| _(none)_ | The board saved in this browser, or the sample |
| `?src=<url>` | That markdown file (absolute, or relative to the page). It isn't saved in the browser, so it never overwrites your board. |
| `?view=` | `board` (default), `split`, `archive` or `markdown` |
| `?q=` `?tags=a,b` `?owners=a,b` | Search text and filters |
| `?task=<id>` | Opens that task, e.g. `?task=t-07` |
| `?theme=` | `minimal`, `paper`, `terminal`, `ocean`, `ballpit`, `graph`, `night`, `blueprint` or `ledger`, without changing the file. Picking a style saves it in the file. |

The address bar follows the app, so any view can be bookmarked or shared. Files on another host must allow
CORS (GitHub Pages and raw.githubusercontent.com both do).

## Viewing locally

```sh
make dev     # serves the repo on http://localhost:8000/ and prints the example's URL
```

Save writes the `?src=` file back to disk (any existing `.md` in the repo). The server only listens on loopback.

## Using it in a project

The app is published to npm as [`@pritzlaff/agile`](https://www.npmjs.com/package/@pritzlaff/agile):

```sh
bunx @pritzlaff/agile board.md          # serves the board on localhost and opens it; Save writes board.md
bunx @pritzlaff/agile badge board.md    # writes badge.svg beside it (or: badge board.md out-dir)
bunx @pritzlaff/agile card board.md     # writes card.json
```

The card links to `AGILE_HOST` (default `https://aaronp.github.io/agile/`) with `?src=AGILE_SRC` (default:
the path given). [`examples/bun-app`](examples/bun-app) keeps its board beside the code, with a
`make snapshot` target and a Pages workflow that publishes the board, badge and card.

## Hosting

`.github/workflows/pages.yml` runs the tests on pushes to `main` or `master`, then publishes the app as
`index.html` with `examples/` beside it. Set Settings → Pages → Source: **GitHub Actions**; the
`github-pages` environment must allow your branch. `.md` files are served raw, without Jekyll.

## Publishing your own board

Your board lives in its own data-only repo (`board.md`, a redirecting `index.html` and a Pages workflow),
and this repo stays the app. Create an empty repo on GitHub, then:

```sh
git clone https://github.com/aaronp/agile.git
cd agile/examples/acme-sprint
make clone REPO=you/your-board    # or ./clone.sh to be prompted
```

This copies the example to `../your-board` as a fresh repo on `main`, points its README link at
`https://you.github.io/your-board/` and sets the `origin` remote. Edit `board.md`, commit and
`git push -u origin main`, then set Settings → Pages → Source: **GitHub Actions**.

## Development

```sh
make test    # bun test: the format, the address bar, opening, recents, saving, the card and the CLI
```

Releasing to npm (needs a clean tree and `npm login`):

```sh
make bump-patch    # or bump-minor / bump-major: bumps package.json, commits and tags v<version>
make publish       # tests, then npm publish
git push --follow-tags
```

| Path | What |
| --- | --- |
| `Main.dc.html` | The app: an `<x-dc>` template plus its logic (schema, markdown parser and serializer, board operations, themes, effects) |
| `support.js`, `vendor/` | The runtime that renders the template in a browser |
| `bin/agile.mjs` | The `agile` command: a local server with write-back, and `badge` / `card` (loads the logic from `Main.dc.html`) |
| `examples/acme-sprint/` | A cloneable data-only repo that points back at this app |
| `examples/bun-app/` | A Bun project using the published package for its own board |
| `app.test.ts` | Runs the logic with the browser stubbed out |
