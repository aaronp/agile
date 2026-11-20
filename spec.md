# Board file format

A board is one markdown file: optional front matter, a `# Title`, then one `## Column` per column, each
holding its tasks as `### ` headings. The app reads it, draws it, and writes it back in the same layout.

The format is **strict**: every non-blank line must be one of the pieces below. A file that doesn't read
is shown with the line number and what was expected, and nothing is overwritten until it is fixed.

## Minimal example

````markdown
# Sprint 1

## To Do

### Set up CI
- id: t-01
- owner:
- tags:
- history:
  - To Do @ 2026-11-19T09:00:00Z
````

One column, one unassigned, untagged task. That is a complete board.

## Full example

````markdown
---
version: 1
theme: paper
effects.complete: fireworks
---
# My app

## To Do

### Set up CI
- id: t-01
- owner: Priya
- tags: infra
- history:
  - To Do @ 2026-11-19T09:00:00Z by Priya

```md
Run the tests on every push.

- [ ] lint
- [ ] tests
```

## Doing

### Login page
- id: t-02
- owner: Tom
- tags: frontend, auth
- history:
  - To Do @ 2026-11-18T09:00:00Z by Tom
  - Doing @ 2026-11-19T10:30:00Z by Tom

### Password reset
- id: t-03
- parent: t-02
- owner:
- tags: frontend
- history:
  - Doing @ 2026-11-19T11:00:00Z

## Done

## Archive <!-- archive -->

### Pick a name
- id: t-00
- owner: Priya
- tags:
- history:
  - To Do @ 2026-11-10T09:00:00Z by Priya
  - Done @ 2026-11-12T16:00:00Z by Priya
````

[`examples/acme-sprint/board.md`](examples/acme-sprint/board.md) is a larger board using every feature.

## Layout

| Line | Meaning |
| --- | --- |
| `---` … `---` | Optional front matter, first thing in the file (see below). |
| `# <title>` | **Required**, once: the board's name. Only blank lines may follow it before the first column. |
| `## <column>` | A column, left to right in file order. Names may repeat, but history then can't tell them apart. |
| `## Archive <!-- archive -->` | Optional, last: completed tasks, oldest first. Hidden from the board, shown in the Archive view. |
| `### <task title>` | A task in the column above it, top to bottom in file order. One line. |

## Tasks

Straight after its `### ` heading, a task has these lines, in this order:

| Line | Required | Meaning |
| --- | --- | --- |
| `- id: t-07` | yes | Unique across the board (archive included). Letters, digits, `-` and `_`. New tasks get the next `t-NN`. |
| `- parent: t-03` | no | The task this one was split out of. It must exist, and a task can't be its own ancestor. Children show indented under their parent. |
| `- owner: Priya` | yes, may be empty | Free-text name of whoever has it. `- owner:` means unassigned. |
| `- tags: a, b` | yes, may be empty | Comma-separated labels (so a tag can't contain a comma). |
| `- history:` | yes | Followed by at least one entry, oldest first (below). |

Each history entry is indented two spaces:

```markdown
  - Doing @ 2026-11-19T10:30:00Z by Tom
```

`<column name> @ <UTC timestamp> [by <owner>]`. The first entry is when the task was created; each later
one is a move to another column, or a change of owner in the same column. The app appends one on every
move, so the file records how long each task spent where. Timestamps are UTC (`…Z`), with optional
seconds and milliseconds.

**Description.** Optional, after the metadata: a fenced block opened with ` ```md ` and closed with
` ``` `. Inside it is ordinary markdown (bold, lists, checklists, code), kept apart so its headings and
lists never clash with the board's. If the text itself contains ` ``` ` lines, use a longer fence.

**Definition of done.** Optional, after the description: a fenced block opened with ` ```dod `, holding
markdown the same way (usually a checklist). The task panel shows it as a collapsible section with its
checklist progress.

## Front matter

Optional `key: value` lines between `---` markers. Only values that differ from the defaults are written.

| Key | Values |
| --- | --- |
| `version` | Format version, currently `1`. Written on save; a file without one is version 1, and a newer one is refused rather than misread. |
| `theme` | `minimal` (default), `paper`, `terminal`, `ocean`, `ballpit`, `graph`, `night`, `blueprint`, `ledger` |
| `<theme>.<setting>` | A style's own settings, e.g. `ocean.swell: 0.6`. Set them in **☰ → Style**. |
| `effects.create` | `pop` (default), `supernova`, `random`, `none` |
| `effects.delete` | `explode` (default), `burn`, `random`, `none` |
| `effects.complete` | `confetti` (default), `fireworks`, `bubbles`, `balloons`, `random`, `none` |
| `badge` | The badge's columns as JSON, `[[column, symbol, icon, color], …]`. Set it from the badge dialog. |

## Card

`agile card board.md [out-dir]` writes `card.json` (version 1, the tool-neutral format Decision Ledger's
`adr card` also writes): the board's title, a status pill (`N open` or `All done`), done/total as the big
number, and a count per badge column. `agile badge` draws `badge.svg` from the same data. Links open
`AGILE_HOST` (default `https://aaronp.github.io/agile/`) on `AGILE_SRC` (default: the path given).
