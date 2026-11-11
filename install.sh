#!/bin/bash
# Hum installer for Mac testers.
#
#   curl -fsSL https://muppio.github.io/hum-testers/install.sh | bash
#
# Downloads the Hum release pinned below, checks its SHA-256, puts Hum.app in /Applications
# (or ~/Applications when /Applications isn't writable) and opens it. It never uses sudo,
# changes no security setting, sends nothing anywhere, downloads nothing else, and never
# touches Hum's settings and history in ~/Library/Application Support.
#
# Everything runs inside main(), called on the last line, so a partly downloaded script does
# nothing. Written for the bash 3.2 that ships with macOS.

set -euo pipefail

# BEGIN PINNED RELEASE (written by tools/generate-install-scripts.js from dist/releases.json; do not edit by hand)
HUM_VERSION=''
HUM_URL=''
HUM_FILE_NAME=''
HUM_SIZE_BYTES=''
HUM_SHA256=''
# END PINNED RELEASE

say() { printf '%s\n' "$1"; }

fail() {
  printf 'Hum was not installed: %s\n' "$1" >&2
  exit 1
}

bundle_id() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Contents/Info.plist" 2>/dev/null || true
}

main() {
  if [ -z "$HUM_URL" ]; then
    say "The Mac version isn't available yet. Nothing was downloaded."
    exit 0
  fi

  [ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS."
  [ "$(uname -m)" = "arm64" ] || fail "Hum for Mac needs a Mac with Apple silicon."
  local major
  major="$(sw_vers -productVersion | cut -d. -f1)"
  [ "$major" -ge 26 ] 2>/dev/null || fail "Hum for Mac needs macOS 26 or newer."

  say "Hum installer for Mac: version $HUM_VERSION (unsigned pre-release)"
  if pgrep -x Hum >/dev/null 2>&1; then
    fail "Hum is running. Quit Hum (Hum menu, then Quit Hum) and run this command again. Nothing was changed."
  fi

  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/hum-install.XXXXXX")"
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" EXIT

  local megabytes=$(( HUM_SIZE_BYTES / 1048576 ))
  say "Downloading $HUM_FILE_NAME ($megabytes MB)..."
  curl -fL --proto '=https' --tlsv1.2 --retry 2 --silent --show-error -o "$work/$HUM_FILE_NAME" "$HUM_URL" \
    || fail "the download failed. Check your connection and try again."

  say "Checking the SHA-256 checksum..."
  local actual size
  actual="$(shasum -a 256 "$work/$HUM_FILE_NAME" | awk '{print $1}')"
  size="$(wc -c < "$work/$HUM_FILE_NAME" | tr -d ' ')"
  if [ "$actual" != "$HUM_SHA256" ] || [ "$size" != "$HUM_SIZE_BYTES" ]; then
    fail "the download doesn't match the published checksum (expected $HUM_SHA256, got $actual). It was deleted and nothing was installed."
  fi
  say "Checksum OK."

  mkdir "$work/unpacked"
  ditto -x -k "$work/$HUM_FILE_NAME" "$work/unpacked" || fail "the download couldn't be unpacked."
  local app="$work/unpacked/Hum.app"
  [ -d "$app" ] || fail "the download doesn't contain Hum.app."

  local destination
  if [ -w /Applications ]; then
    destination="/Applications"
  else
    destination="$HOME/Applications"
    mkdir -p "$destination"
  fi
  local target="$destination/Hum.app"

  if [ -e "$target" ]; then
    local existing new
    existing="$(bundle_id "$target")"
    new="$(bundle_id "$app")"
    if [ -z "$new" ] || [ "$existing" != "$new" ]; then
      fail "a different app named Hum is already in $destination. Nothing was changed."
    fi
    if pgrep -x Hum >/dev/null 2>&1; then
      fail "Hum is running. Quit Hum and run this command again. Nothing was changed."
    fi
    mv "$target" "$work/previous-Hum.app" || fail "couldn't replace $target. Nothing was changed."
  fi

  say "Installing to $target..."
  if ! mv "$app" "$target"; then
    if [ -d "$work/previous-Hum.app" ] && [ ! -e "$target" ]; then
      mv "$work/previous-Hum.app" "$target" || true
    fi
    fail "couldn't move Hum.app into $destination."
  fi

  say "Opening Hum."
  open "$target"
  say "Done. Hum $HUM_VERSION is installed in $destination."
}

main
