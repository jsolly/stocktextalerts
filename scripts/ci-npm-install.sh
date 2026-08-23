#!/usr/bin/env bash
# CI-only: install node_modules, skipping `npm ci` when a previous install in
# this workspace already matches the lockfile.
#
# On GitHub-hosted runners the workspace is ephemeral, so this is almost always
# a miss → `npm ci`. The stamp still makes a same-job re-invoke safe and was
# the reuse check when CI used a persistent node_modules mount (Blacksmith
# sticky disk, removed in the GitHub-hosted cutover trial).
#
# Usage: bash scripts/ci-npm-install.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="node_modules/.ci-lock-hash"
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"

# `.bin/tsx` guards against a truncated install (an interrupted install commits a
# tree with no stamp, but check a real entrypoint too rather than trust the file).
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$LOCK_HASH" ] && [ -x node_modules/.bin/tsx ]; then
	echo "node_modules: lockfile-stamp hit for ${LOCK_HASH:0:12}, skipping npm ci"
	exit 0
fi

echo "node_modules: lockfile-stamp miss for ${LOCK_HASH:0:12}, running npm ci"
npm ci
printf '%s\n' "$LOCK_HASH" >"$STAMP"
