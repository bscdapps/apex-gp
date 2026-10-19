#!/usr/bin/env bash
# Build (when needed) and serve the static site in the foreground on PORT.
#
# The runtime's default launcher performs the dependency install, the Vite
# build, the static serve, the build watch and the deployment-output.json
# handshake; this wrapper pins PORT and the worker metadata directory and
# records per-command timing.
set -euo pipefail
cd "$(dirname "$0")"
: "${RUNTIME_DIR:?Runtime directory is required}"
export PORT="${PORT:-3000}"
export OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-${RUNNER_TEMP:-/tmp}/omgithub-web}"
/usr/bin/time -p mkdir -p "$OPENCODE_WEB_DIR"
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-start.mjs"
