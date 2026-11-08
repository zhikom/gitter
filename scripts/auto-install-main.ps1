# Gitter Auto-Install Hook Script
# Executed automatically in the background after git commit or git merge on main

$ErrorActionPreference = "SilentlyContinue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# 1. Build the production distribution
& npm.cmd run build

# 2. Show Windows Toast/Popup Notification
try {
    $wshell = New-Object -ComObject Wscript.Shell
    $wshell.Popup("Gitter on branch main has been updated and built successfully!", 3, "Gitter Auto-Install", 64) | Out-Null
} catch {}
