#!/usr/bin/env bash
set -e

echo "==> Installing Claude Code..."

if command -v claude >/dev/null 2>&1; then
  echo "Claude Code is already installed: $(claude --version 2>/dev/null || true)"
  exit 0
fi

# Method 1: npm (needs Node.js 18+)
if command -v npm >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if [ "${NODE_MAJOR:-0}" -ge 18 ]; then
    echo "==> Using npm"
    if npm install -g @anthropic-ai/claude-code; then
      echo "Done. Run: claude"
      exit 0
    fi
    echo "npm global install failed (permissions?). Trying with sudo..."
    if command -v sudo >/dev/null 2>&1 && sudo npm install -g @anthropic-ai/claude-code; then
      echo "Done. Run: claude"
      exit 0
    fi
  fi
fi

# Method 2: official native installer
echo "==> Falling back to the official installer"
curl -fsSL https://claude.ai/install.sh | bash

echo "Done. Restart your terminal, then run: claude"
