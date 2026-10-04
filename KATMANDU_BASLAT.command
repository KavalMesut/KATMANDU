#!/bin/bash
# Finder opens .command files in Terminal. Keep this file in the project folder.
set -u

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  if [[ -t 0 ]]; then read -r -p "Press Enter to close this window..." || true; fi
  exit 1
}

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 1
cd -- "$PROJECT_DIR" || fail "Could not open the project folder."
[[ -f package.json ]] || fail "package.json was not found. Keep the launcher in the project folder."

# Finder's Terminal may not load the user's nvm setup.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  NVM_SCRIPT="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [[ -s "$NVM_SCRIPT" ]]; then source "$NVM_SCRIPT"; fi
fi
command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install Node.js 22.13 or newer."
command -v npm >/dev/null 2>&1 || fail "npm was not found. Check your Node.js installation."
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' || fail "Node.js 22.13 or newer is required."

if [[ ! -f node_modules/.package-lock.json ]]; then
  printf 'Installing dependencies for the first launch. This may take a few minutes...\n'
  npm ci --no-audit --no-fund || fail "Could not install dependencies. Check your internet connection and the error above."
fi

BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
printf '\nStarting KATMANDU...\nProject: %s\nCurrent branch: %s\n' "$PROJECT_DIR" "${BRANCH:-Could not determine the Git branch}"
printf 'Address: http://127.0.0.1:5173/\nPress Ctrl+C in this terminal to stop.\n\n'
# Vite opens the macOS browser; no Linux-specific flock or xdg-open is needed.
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
RESULT=$?
if [[ "$RESULT" -ne 0 && "$RESULT" -ne 130 && "$RESULT" -ne 143 ]]; then
  fail "Could not start the server. If port 5173 is in use, stop the other server first; see details above."
fi
exit "$RESULT"
