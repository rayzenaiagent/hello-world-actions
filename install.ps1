# Windows installer for Claude Code
$ErrorActionPreference = 'Stop'
Write-Host '==> Installing Claude Code...'

if (Get-Command claude -ErrorAction SilentlyContinue) {
  Write-Host 'Claude Code is already installed.'
  exit 0
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
  npm install -g @anthropic-ai/claude-code
  Write-Host 'Done. Run: claude'
} else {
  Write-Host 'Using the official installer...'
  irm https://claude.ai/install.ps1 | iex
}
