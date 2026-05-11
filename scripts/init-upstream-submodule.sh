#!/usr/bin/env bash
# Run from repo root after clone. Usage:
#   ./scripts/init-upstream-submodule.sh git@github.com:YOU/storefront-chatbot.git
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <git-url-of-storefront-chatbot-repo>"
  exit 1
fi
if [[ -d upstream ]]; then
  echo "upstream/ already exists"
  exit 1
fi
git submodule add "$1" upstream
git submodule update --init --recursive
echo "Commit .gitmodules and upstream with: git add .gitmodules upstream && git commit -m 'Add upstream submodule'"
