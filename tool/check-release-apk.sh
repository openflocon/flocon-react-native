#!/usr/bin/env bash
# Checks that an APK has no Flocon native implementation, only the stub of the release source set.
# Works on minified (R8) APKs too: it looks for the error codes only the debug implementation contains.
# Usage: tool/check-release-apk.sh path/to/app.apk
set -euo pipefail
apk="$1"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
unzip -q -o "$apk" 'classes*.dex' -d "$tmp"
count() { cat "$tmp"/classes*.dex | LC_ALL=C grep -ac "$1" || true; }
stub="$(count ERR_FLOCON_UNAVAILABLE)"
implementation="$(( $(count ERR_FLOCON_CONNECT) + $(count ERR_FLOCON_FILE_NAME) ))"
echo "$apk: stub ${stub}, debug implementation ${implementation}"
if [ "$implementation" -gt 0 ]; then
  echo "✕ The debug implementation of Flocon (certificate handling, file and SQL access) is in this APK" >&2
  exit 1
fi
if [ "$stub" -eq 0 ]; then
  echo "✕ The Flocon module is missing from this APK" >&2
  exit 1
fi
echo "✓ Only the release stub of Flocon is in this APK"
