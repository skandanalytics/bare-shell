#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

if [ "$(uname -s)" != "Linux" ]; then
  echo "Warning: this script is intended for Linux. Use scripts/setup-mac.sh on macOS."
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js first, then rerun this script."
  exit 1
fi

cd "$ROOT_DIR"
node scripts/source_install_check.js --platform=linux "$@"
