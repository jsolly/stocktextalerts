#!/usr/bin/env bash
# Install Playwright chromium-headless-shell for CI.
# Browser binaries land in ~/.cache/ms-playwright on this ephemeral runner.
# OS deps (apt) are installed on the runner filesystem; the deps marker is
# per-runner under /tmp so a later step in the same job can skip apt.
# See .github/workflows/ci.yml + docs/github-ci.md.
#
# Usage: bash scripts/db/ci-playwright-install.sh
# Writes exit status to /tmp/playwright-install.rc (for the wait step).
set -uo pipefail

rc_file="${PLAYWRIGHT_INSTALL_RC_FILE:-/tmp/playwright-install.rc}"
# Runner-local: apt packages do not persist across jobs.
deps_marker="${PLAYWRIGHT_DEPS_MARKER:-/tmp/playwright-ci-deps-installed}"

write_rc() {
	echo "$1" >"$rc_file"
}

npx playwright install --only-shell
rc=$?
if [ "$rc" -ne 0 ]; then
	write_rc "$rc"
	exit "$rc"
fi

if [[ ! -f "$deps_marker" ]]; then
	echo "No OS-deps marker on this runner — running playwright install-deps chromium"
	npx playwright install-deps chromium
	rc=$?
	if [ "$rc" -eq 0 ]; then
		touch "$deps_marker"
	fi
else
	echo "OS-deps marker present on this runner — skipping install-deps"
fi

write_rc "$rc"
exit "$rc"
