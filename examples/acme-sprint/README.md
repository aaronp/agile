# Acme — sprint board

**[▶ View the board](https://aaronp.github.io/agile-example/)**

The data lives in [`board.md`](board.md). The UI comes from
[aaronp/agile](https://github.com/aaronp/agile).

## Using this as a template

1. Create an empty repo on GitHub, then from this directory run
   `make clone REPO=you/your-repo` (or `./clone.sh`, which prompts).
   It copies the files to `../your-repo`, points the View link above at
   your Pages site and sets the git remote.
2. Edit `board.md` (or edit it on the board and use **Save** or **Download**),
   then commit and push.
3. On GitHub: Settings → Pages → Source: **GitHub Actions**.
4. Optional: on the repo page, open About (⚙) → tick **Use your GitHub Pages
   website** so the link also shows in the sidebar.

The workflow deploys from `main` or `master`. "Branch … is not allowed to
deploy to github-pages"? Add your branch under Settings → Environments →
github-pages → Deployment branches and tags.

Your site redirects to the board with `?src=` pointing at your `board.md`.
Any query params you add are passed on, e.g. `?theme=paper&view=split`.

No Pages? Link straight to the file:
`https://aaronp.github.io/agile/?src=https://github.com/<you>/<repo>/blob/<branch>/board.md`
