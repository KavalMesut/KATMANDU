#!/usr/bin/env bash
set -u

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  if [[ -t 0 ]]; then
    read -r -p "Press Enter to close this window..." || true
  fi
  exit 1
}

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 1
cd -- "$PROJECT_DIR" || fail "Could not open the project folder."

[[ -f package.json ]] || fail "package.json was not found. Keep the launcher in the project folder."

# A terminal opened from the file manager may not have nvm on PATH.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  NVM_SCRIPT="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [[ -s "$NVM_SCRIPT" ]]; then
    source "$NVM_SCRIPT"
  fi
fi

command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install Node.js 22.13 or newer."
command -v npm >/dev/null 2>&1 || fail "npm was not found. Check your Node.js installation."
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' || fail "Node.js 22.13 or newer is required."
command -v flock >/dev/null 2>&1 || fail "flock was not found. Install the util-linux package for your distribution."

APP_URL="http://127.0.0.1:5173/"
# Keep the lock file: all invocations must lock the same file.
exec 9>".katmandu-launch.lock" || fail "Could not open the launcher lock file."
if ! flock -n 9; then
  printf 'The KATMANDU launcher is already running. Opening the browser: %s\n' "$APP_URL"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$APP_URL" || fail "Could not open the browser. Open this address manually: $APP_URL"
  else
    fail "Open this address in your browser: $APP_URL"
  fi
  exit 0
fi

if [[ ! -f node_modules/.package-lock.json ]]; then
  printf 'Installing dependencies for the first launch. This may take a few minutes...\n'
  npm ci --no-audit --no-fund || fail "Could not install dependencies. Check your internet connection and the error above."
fi

BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
printf '\nStarting KATMANDU...\n'
printf 'Project: %s\n' "$PROJECT_DIR"
printf 'Current branch: %s\n' "${BRANCH:-Could not determine the Git branch}"
printf 'Address: %s\n' "$APP_URL"
printf 'The browser will open when the server is ready.\n'
printf 'Press Ctrl+C in this terminal to stop.\n\n'

# A stable address preserves browser settings; never silently switch ports.
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
RESULT=$?
if [[ "$RESULT" -ne 0 && "$RESULT" -ne 130 && "$RESULT" -ne 143 ]]; then
  fail "Could not start the server. If port 5173 is in use, stop the other server first; see details above."
fi
exit "$RESULT"
