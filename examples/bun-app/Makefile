# Where the published board.md lives. Pages serves board/ at the site root, so for the GitHub repo
# you/your-app that is https://you.github.io/your-app/board.md (worked out from the origin remote).
# The card links to the hosted app with ?src= pointing here. Override: make snapshot AGILE_SRC=<url>
AGILE_SRC ?= $(shell git remote get-url origin 2>/dev/null | sed -nE 's|^.*github\.com[:/]([^/]+)/([^/]+)$$|https://\1.github.io/\2/board.md|p' | sed 's|\.git/board|/board|')

.PHONY: snapshot
# Regenerates board/badge.svg and board/card.json from board/board.md (and its badge settings).
snapshot:
	AGILE_SRC=$(AGILE_SRC) bunx agile badge board/board.md
	AGILE_SRC=$(AGILE_SRC) bunx agile card board/board.md
