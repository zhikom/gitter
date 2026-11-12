# Run by the .githooks hooks after a commit or merge on main: rebuilds the web UI.
# It does not install the desktop app.

$ErrorActionPreference = "SilentlyContinue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# 1. Build the production distribution
& npm.cmd run build

# 2. Show Windows Toast/Popup Notification
try {
    $wshell = New-Object -ComObject Wscript.Shell
    $message = if ($LASTEXITCODE -eq 0) { "Gitter's web UI on main was rebuilt." } else { "Rebuilding Gitter's web UI on main failed (npm run build)." }
    $wshell.Popup($message, 3, "Gitter build hook", 64) | Out-Null
} catch {}
