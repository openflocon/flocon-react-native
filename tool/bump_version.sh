#!/usr/bin/env bash
# Bumps every package to <version>: package.json, the native versions, and the version reported to the desktop.
# Usage: tool/bump_version.sh 0.2.0
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 1 ] || { echo "Usage: $0 <version>"; exit 1; }
version="$1"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid version: $version"; exit 1; }
for pkg in packages/*/package.json; do
  sed -i.bak -E "s/^  \"version\": \".*\"/  \"version\": \"${version}\"/" "$pkg" && rm "$pkg.bak"
done
sed -i.bak -E "s/FLOCON_SDK_VERSION = '.*'/FLOCON_SDK_VERSION = '${version}'/" packages/react-native/src/version.ts && rm packages/react-native/src/version.ts.bak
sed -i.bak -E "s/^version = '.*'/version = '${version}'/; s/versionName \".*\"/versionName \"${version}\"/" packages/react-native/android/build.gradle && rm packages/react-native/android/build.gradle.bak
echo "Bumped to ${version}. Review with git diff, then tag v${version}."
