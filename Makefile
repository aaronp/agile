PORT ?= 8000

.PHONY: dev test publish bump-patch bump-minor bump-major

test:
	bun test ./app.test.ts

# Serves the repo as GitHub Pages does: Main.dc.html at /, everything else beside it (so ?src=examples/... works).
# Save (Ctrl/⌘ S) writes a ?src .md file back to disk (see bin/agile.mjs).
dev:
	@echo "Example: http://localhost:$(PORT)/?src=examples/acme-sprint/board.md"
	@PORT=$(PORT) NO_OPEN=1 node bin/agile.mjs .

# Bumps package.json, commits and tags v<version> (needs a clean tree)
bump-patch bump-minor bump-major:
	npm version $(@:bump-%=%)

# Publishes @pritzlaff/agile to npm. Bump first: make bump-patch|bump-minor|bump-major
publish: test
	npm publish
