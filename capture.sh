#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the running preview.
#
# Requires CAPTURE_URL (the live preview URL) and CAPTURE_DIR (an evidence
# directory outside the source tree). Writes final-desktop.png and
# final-mobile.png into CAPTURE_DIR and leaves the app running. Exit 75 marks
# transient browser/navigation failures; exit 1 marks script or render defects.
set -euo pipefail
cd "$(dirname "$0")"
: "${RUNTIME_DIR:?Runtime directory is required}"
: "${CAPTURE_URL:?Set CAPTURE_URL to the preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR for final-desktop.png / final-mobile.png}"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node tools/omgithub-capture.mjs
