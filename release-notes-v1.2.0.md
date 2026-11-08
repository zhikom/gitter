# 🚀 Gitter v1.2.0 — Multi-Agent Fleet Orchestrator & Ultimate Git Suite

We are thrilled to release **Gitter v1.2.0**, a milestone release that transforms Gitter from an elite Git client into the world's first **Multi-Agent Git Orchestrator**. 

This release aggregates **all enhancements, architectural innovations, and fixes from v1.0.0 through v1.2.0**, delivering complete feature parity with GitKraken, Sublime Merge, GitButler, and JetBrains Source Control, paired with deep coordination for autonomous coding agents (**Claude Code**, **Antigravity**, **OpenAI Codex**, **Grok Build**, and **Cursor**).

---

## 🤖 1. Multi-Agent Fleet Orchestrator & Collision Radar 2.0 *(Industry First)*

When running multiple autonomous coding agents in parallel, agents frequently overwrite each other's live changes, crash file watchers, and produce catastrophic merge conflicts. Gitter v1.2.0 introduces the **Multi-Agent Fleet Orchestrator**:

- **Real-Time Collision Radar**: Continuously inspects modified and claimed files across all active agent branches and worktrees. If two agents (e.g., Claude Code and Antigravity) touch the same file or overlapping hunks, a pulsating top-bar warning (`⚠️ N Collisions!`) alerts you immediately before commits happen.
- **1-Click Agent Worktree Sandboxing**: Automatically provisions dedicated Git worktrees (`../gitter-agent-<harness>-<task>`) linked to `agent/*` branches. Every agent gets an isolated file system directory sharing the central `.git` object store, guaranteeing zero file overwrites.
- **Pre-Flight File Territory & Claim Matrix**: Declare module boundaries and claim files before dispatching agents. If another agent touches claimed territory, the Collision Radar flags the contention.
- **Stale Git Index Lock Breaker**: Automatically detects and cleanly clears stale `.git/index.lock` files left behind by interrupted background agent runners.
- **Agent Attribution Badges in Visual Commit Graph**: Commits authored or co-authored by agents display distinct color-coded badges (`Claude`, `AGY`, `Codex`, `Grok`, `Cursor`, `AI`) directly beside author names.
- **1-Click "Tag Agent" in Commit Box**: Standardized Git trailers (`Co-authored-by: Agent <...>`, `Agent-Harness: ...`) injected into commit descriptions with one click.

---

## 🗂️ 2. Permanent Multi-Repo Tab Management *(Browser-Class Tabs)*

- **Permanent Repo Tab Bar**: Tab bar elevated to primary top-level navigation with instant repository switching.
- **Productivity Shortcuts**:
  - `Ctrl+W` / `Cmd+W`: Close current repository tab.
  - `Ctrl+Tab`: Cycle through open repository tabs.
  - `Ctrl+Shift+Tab`: Cycle tabs in reverse.
  - Middle-click: Close tab immediately.
- **Context Menu**: Right-click tabs to *Close*, *Close Other Tabs*, *Copy Full Path*, or *Reveal in OS File Explorer*.
- **State Cleanliness**: Clean state resets between tab switches to isolate commit selection, diffs, and staging lists.

---

## 🔍 3. Repositories Scanner & Native OS Dialogs

- **Recursive Repositories Folder Scanner**: Point Gitter to any parent directory (e.g. `C:/Users/username/repos` or `~/Developer`) to automatically discover all Git repositories. Displays dirty status, current branch, and last commit summaries with 1-click recent list imports.
- **Native OS File & Folder Pickers**: Uses native WinForms STA top-most dialogs on Windows, `osascript` on macOS, and `zenity`/`kdialog` on Linux, with Electron native IPC integration.
- **1-Click Toolbar File Manager Launcher**: Added direct "Open in File Explorer / Finder", "Open in VS Code", and "Open in Terminal" buttons in the top header toolbar.

---

## 🧭 4. Sidebar Search & Navigator Filtering

- **Instant Sidebar Filter (`Ctrl+F`)**: Real-time fuzzy filter bar above the sidebar. Instantly filters Local Branches, Remote Branches, Tags, and Stashes with live match count badges and a 1-click clear button.
- **Configurable UI & Decluttering**: Ability to hide submodules, stashes, or shelves when not in use to keep panels focused.

---

## ⚙️ 5. Sophisticated Per-Project & Global Settings

- **Per-Repository Configuration** (`.git/gitter/config.json`):
  - Pull strategy overrides: *Rebase*, *Merge*, or *Fast-Forward Only*.
  - Line ending conversion policies (`core.autocrlf` input/true/false).
  - Git LFS auto-tracking toggles.
  - Custom external diff and merge tool commands.
  - Pre-commit and commit-msg hook bypass switches.
- **Global Preferences**: Configurable auto-update checks, default branch names, author identity overrides, and graph densities.

---

## 🌊 6. Full Gitflow Integration

- **Standardized Branching Workflow**: Integrated support for Gitflow initialized in `.git/gitter/gitflow.json`.
- **1-Click Actions**: Start and finish Features (`feature/*`), Releases (`release/*`), and Hotfixes (`hotfix/*`) with automated semantic tagging and merge back into `develop` and `main`.

---

## 🔄 7. In-App Auto-Update & Changelog Viewer

- **Live GitHub Releases Checking**: Automatically queries the GitHub Releases API on startup or manually via the Header menu.
- **In-App Update Modal**: Displays release version badges, publishing dates, and rendered Markdown changelogs with direct download links.

---

## 🛠️ 8. Critical Bug Fixes & Stability

- **Scanner JSON Error Resolved**: Eliminated the `Unexpected token '<' !doctype is not valid json` error by configuring `getBaseUrl()` to directly connect to `http://127.0.0.1:3001/api` across Vite dev, preview, Tauri, and Electron, with explicit HTML content-type detection.
- **Windows File Picker Fix**: Fixed `ReferenceError: __dirname is not defined` under Node ES module scope (`type: "module"`), ensuring PowerShell folder browser dialogs appear in front of all windows.
- **AI Dock Initial State**: AI agent sidebar now defaults to closed on startup and persists cleanly without cluttering the screen on initial launch.
- **Backend Express Static Hosting**: Backend server on port 3001 now serves built production assets from `dist/` with SPA routing fallback.

---

## 📦 Downloads & Binaries

| Operating System | Download File | Description |
|---|---|---|
| **Windows** | [`Gitter_1.2.0_x64-setup.exe`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter_1.2.0_x64-setup.exe) | 64-bit Windows NSIS Installer |
| **Windows** | [`Gitter_1.2.0_x64_en-US.msi`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter_1.2.0_x64_en-US.msi) | Windows Installer MSI Package |
| **macOS** | [`Gitter_1.2.0_universal.dmg`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter_1.2.0_universal.dmg) | Universal Apple Silicon & Intel DMG |
| **macOS** | [`Gitter_universal.app.tar.gz`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter_universal.app.tar.gz) | Standalone macOS App Bundle |
| **Linux** | [`Gitter_1.2.0_amd64.AppImage`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter_1.2.0_amd64.AppImage) | Portable Linux AppImage |
| **Linux** | [`Gitter_1.2.0_amd64.deb`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter_1.2.0_amd64.deb) | Debian / Ubuntu Package |
| **Linux** | [`Gitter-1.2.0-1.x86_64.rpm`](https://github.com/zhikom/gitter/releases/download/v1.2.0/Gitter-1.2.0-1.x86_64.rpm) | Fedora / RedHat / openSUSE RPM |
| **VS Code** | [`gitter-vscode-1.2.0.vsix`](https://github.com/zhikom/gitter/releases/download/v1.2.0/gitter-vscode-1.2.0.vsix) | Native Visual Studio Code Extension |

---

*Full source code & documentation available at [https://github.com/zhikom/gitter](https://github.com/zhikom/gitter).*
