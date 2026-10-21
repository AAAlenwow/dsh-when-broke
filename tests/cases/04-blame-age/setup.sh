#!/usr/bin/env bash
# Build sample-app in this case's own dir.
set -euo pipefail
cd "$(dirname "$0")"
bash ../../build-sample-repo.sh sample-app
