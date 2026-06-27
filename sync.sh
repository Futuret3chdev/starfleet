#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
MSG="${1:-Update Starfeet}"
cd "$ROOT"
if [ ! -d .git ]; then
  git init
  git branch -M main
fi
git add -A
git diff --cached --quiet && echo "Nothing to commit" && exit 0
git commit -m "$MSG"
if git remote get-url origin &>/dev/null; then
  git push origin main
  echo "✅ Pushed to origin/main"
else
  echo "💡 Run: git remote add origin <your-repo-url> && ./sync.sh"
fi