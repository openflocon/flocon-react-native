#!/usr/bin/env bash
# Typechecks and tests every package and the sample.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit -p tsconfig.json
(cd sample && npx tsc --noEmit)
npx jest
