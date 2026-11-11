# 🐙 Gitter — The Elite Open-Source Git Client

<p align="center">
  <img src="extensions/vscode/media/gitter-icon.svg" width="96" height="96" alt="Gitter Logo" />
</p>

<p align="center">
  <strong>Ultra-Fast • Lightweight Native Rust Backend • GitButler Virtual Branches • 3-Way Conflict Resolver • VS Code Extension • AI Copilot</strong>
</p>

<p align="center">
  <a href="https://github.com/zhikom/gitter/releases"><img src="https://img.shields.io/github/v/release/zhikom/gitter?color=0d9488&label=release" alt="Release"></a>
  <a href="https://github.com/zhikom/gitter/actions"><img src="https://img.shields.io/github/actions/workflow/status/zhikom/gitter/build.yml?color=0d9488&label=CI%20Build" alt="CI Status"></a>
  <img src="https://img.shields.io/badge/backend-Rust%20%7C%20Tauri%202.0-orange.svg" alt="Tauri 2.0">
  <img src="https://img.shields.io/badge/binary%20size-12.1%20MB-blue.svg" alt="12.1 MB Size">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

---

## ⚡ Why Gitter?

**Gitter** is an ultra-high performance Git client engineered from the ground up to unite the best innovations from **GitKraken**, **Sublime Merge**, **GitButler**, **Fork**, and **JetBrains (IntelliJ/Rider)** into a single, cohesive developer workspace.

Instead of 350MB+ of Electron bloat and monthly SaaS subscriptions, Gitter ships as a **12.1 MB native Tauri 2.0 + Rust** application that launches in milliseconds, preserves your native Git credentials and GPG signing, and embeds directly inside both your desktop and Visual Studio Code.

---

## ✨ Features at a Glance

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  MULTI-AGENT FLEET             GIT KRAKEN                    GITBUTLER         │
│  • Collision Radar 2.0         • Visual Bezier commit graph  • Virtual branch  │
│  • Worktree sandboxes per agent• 3-way merge conflict tool     stacking lanes  │
│  • Pre-flight file claim matrix• Ahead/Behind live badges    • Multi-feature WIP│
├────────────────────────────────────────────────────────────────────────────────┤
│  JETBRAINS (IDEA / RIDER)      AI COPILOT & AGENTS           VS CODE & TABS    │
│  • Selective file stashing     • Claude Code, Antigravity,   • Embedded webview│
│  • Snapshot stash (keep WIP)     Codex, Grok, Cursor, Aider  • Native extension│
│  • Lifetime file history       • AI conflict resolution agent• Multi-repo tabs │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Innovations & Feature Tour

### 1. 🤖 Multi-Agent Fleet Orchestrator & Collision Radar 2.0 *(Industry First)*
- **Real-Time Collision Radar**: Inspects modified and claimed files across parallel agent worktrees and branches. If two agents (e.g. Claude Code and Antigravity) touch the same file or overlapping hunks, a pulsating top-bar warning (`⚠️ N Collisions!`) alerts you immediately before commits happen.
- **1-Click Agent Worktree Sandboxing**: Automatically provisions dedicated Git worktrees (`../gitter-agent-<harness>-<task>`) linked to `agent/*` branches. Every agent gets an isolated file system directory sharing the central `.git` object store, guaranteeing zero file overwrites.
- **Pre-Flight File Territory & Claim Matrix**: Declare module boundaries and claim files before dispatching agents. If another agent touches claimed territory, the Collision Radar flags the contention.
- **Stale Git Index Lock Breaker**: Automatically detects and cleanly clears stale `.git/index.lock` files left behind by interrupted background agent runners.
- **Agent Attribution Badges in Visual Commit Graph**: Commits authored or co-authored by agents display distinct color-coded badges (`Claude`, `AGY`, `Codex`, `Grok`, `Cursor`, `AI`) directly beside author names.
- **1-Click "Tag Agent" in Commit Box**: Standardized Git trailers (`Co-authored-by: Agent <...>`, `Agent-Harness: ...`) injected into commit descriptions with one click.

### 2. 🗂️ Permanent Multi-Repo Tab Management *(Browser-Class Tabs)*
- **Permanent Repo Tab Bar**: Tab bar elevated to primary top-level navigation with instant repository switching.
- **Productivity Shortcuts**:
  - `Ctrl+W` / `Cmd+W`: Close current repository tab.
  - `Ctrl+Tab` / `Ctrl+Shift+Tab`: Cycle through open repository tabs forward and backward.
  - Middle-click: Close tab immediately.
- **Context Menu**: Right-click tabs to *Close*, *Close Other Tabs*, *Copy Full Path*, or *Reveal in OS File Explorer*.
- **State Cleanliness**: Clean state resets between tab switches to isolate commit selection, diffs, and staging lists.

### 3. 📊 Interactive Visual Commit Graph *(GitKraken & Fork Parity)*
- **Topological Multi-Lane Layout**: Automatically assigns vibrant, accessible neon color lanes to branches (`teal`, `blue`, `purple`, `orange`, `pink`, `cyan`, `amber`).
- **Smooth Cubic Bezier Curves**: Merge, fork, and passing lanes rendered with anti-aliased SVG curves.
- **Dynamic Density Switcher**: Toggle instantly between **Compact** (24px), **Normal** (32px), and **Comfortable** (40px) row densities with persistent user settings.
- **Sublime Merge Search Query Syntax**:
  - `author:<name>` or `author:<email>`
  - `hash:<sha>` or `sha:<sha>`
  - `message:<query>` or `msg:<text>`
  - Instant substring search across messages, authors, and branches.
- **Interactive Drag-and-Drop Cherry-Picking**: Drag any commit directly onto a branch pill in the sidebar to cherry-pick instantly.
- **Ctrl+Click / Cmd+Click Two-Commit Range Diff**: Select any two commits on the graph to view changed files, diff comparisons, and generate AI release notes.
- **Context Menu Operations**: Checkout, Create Branch/Tag at commit, Soft/Mixed/Hard Reset, Revert, Cherry-pick, Interactive Rebase, and Copy SHA.

### 2. 🔀 GitButler Multi-Branch Stacking *(Virtual Branches)*
- Work on **2 or 3 features simultaneously** in your working directory without stashing, creating WIP commits, or switching branches.
- Changes in the staging area can be partitioned directly into **Virtual Branch Lanes**.
- Drag files between unassigned changes and independent virtual lanes.
- Commit, stash, or hide lanes individually while preserving clean Git working tree state.

### 3. 📦 Selective Stash & Stash Inspector
- **Selective Stash**: Name a stash and pick exactly which files go into it (`git stash push -- <paths>`), with or without untracked files.
- **Snapshot Mode**: Option to *"Keep changes in the working directory"* saves a stash without reverting your files.
- **Stash Inspector**: Click any stash in the sidebar to inspect modified files, addition/deletion stats (`+N / -M`), and diffs before applying, popping, or dropping.

### 4. 📜 Interactive File History Timeline
- Right-click any file in the staging list or diff view to open **"Show File History (All Commits)"**.
- View every commit revision that touched that specific file across the entire repository lifetime.
- Inspect file diffs revision-by-revision in split or unified views.

### 5. ⚡ Visual 3-Way Merge Conflict Resolver
- Dedicated 3-column conflict resolver:
  - **Ours (Current Branch)** | **Output (Live Editable Result)** | **Theirs (Incoming Branch)**
- **1-Click Block Pickers**: Select *Use Ours*, *Use Theirs*, or *Use Both*.
- Real-time conflict marker tracking (`<<<<<<<`, `=======`, `>>>>>>>`).
- Direct inline editing with syntax highlighting and 1-click **Stage & Save**.

### 6. ✂️ Line-Level & Hunk Staging *(Sublime Merge Parity)*
- **Hunk-Level Staging**: Individual `Stage Hunk`, `Unstage Hunk`, and `Discard Hunk` buttons on every code block.
- **Line-Level Selection**: Click or drag across line numbers in the diff viewer to select custom ranges.
- Floating action bar to `Stage Selected Lines` or `Discard Selected Lines` via precise patch generation.

### 7. ⏪ 1-Click Undo (`Ctrl+Z`) & Visual Reflog Timeline
- Accidental branch deletion? Incorrect hard reset? Erroneous checkout?
- Hit **Undo** (`Ctrl+Z`) in the top toolbar to rollback the last Git operation via the reflog.
- Open the **Visual Reflog Inspector** to inspect `HEAD@{n}` records with 1-click checkout, soft reset, hard reset, or branch recovery.

### 8. 🗂️ Multi-Repository Tab Bar
- Work across multiple repositories simultaneously.
- Chrome-style top tab bar with dirty working tree indicators, active branch tags, and fast repository switching.

### 9. 🤖 Next-Gen AI Copilot & Autonomous Git Agent
- **AI Conventional Commit Generator**: Analyzes staged diffs and generates concise, structured commit messages (`feat:`, `fix:`, `refactor:`, `docs:`) with detailed bullet points.
- **AI Commit & WIP Explainer**: Explains architectural changes, highlights potential breaking changes, and suggests verification test plans.
- **AI Release Notes Generator**: Summarizes multi-commit ranges into markdown changelogs.
- **AI Provider Support**:
  - **Anthropic Claude**: Claude 3.7 Sonnet & Claude 3.5 Sonnet.
  - **Google Gemini**: Gemini 2.0 Flash & Gemini 1.5 Pro.
  - **OpenAI**: GPT-4o, o1, o3-mini.
  - **Local Ollama**: 100% offline and private model execution.
  - **Custom Endpoints**: Any OpenAI-compatible local/remote proxy.

### 10. 💻 Native VS Code Extension (`gitter-vscode`)
- Embedded Webview running inside Visual Studio Code.
- Command Palette integration:
  - `Gitter: Open Interactive Commit Graph`
  - `Gitter: View File History Timeline`
  - `Gitter: Multi-Branch Stacking (Virtual Branches)`
  - `Gitter: 3-Way Visual Merge Conflict Resolver`
- Dedicated **Gitter Activity Bar View** with quick launch actions.
- Two-way editor synchronization: clicking files inside Gitter opens them directly in VS Code.

---

## 📦 Download & Installation

### Prebuilt Desktop Binaries (Tauri 2.0 Native)
Download the latest prebuilt packages from the [**Releases Page**](https://github.com/zhikom/gitter/releases):

| Platform | Format | Description |
|---|---|---|
| **Windows** | `.exe` (NSIS) / `.msi` | 64-bit installer & standalone executable |
| **macOS** | `.dmg` / `.app` | Universal binary (Apple Silicon M1/M2/M3/M4 & Intel x86_64) |
| **Linux** | `.AppImage` / `.deb` | Universal portable AppImage & Debian/Ubuntu package |
| **VS Code** | `.vsix` | Native Visual Studio Code extension |

### VS Code Extension Installation
Download `gitter-vscode.vsix` from the release assets or build from source, then run:
```bash
code --install-extension gitter-vscode-1.0.0.vsix
```

---

## 🛠️ Architecture & Development

Gitter is built for performance and modularity:

```
gitter/
├── src-tauri/             # Native Tauri 2.0 Rust backend (12.1 MB executable)
│   ├── src/commands.rs    # High-speed native Git CLI process bridge
│   ├── src/lib.rs         # Tauri application configuration & hooks
│   └── tauri.conf.json    # Multi-platform bundle definitions
├── server/                # Lightweight Node.js/Express service for Web mode
│   ├── gitService.ts      # Git operations, patch generation, stashes, reflog
│   └── index.ts           # REST API endpoints
├── src/                   # React 18 + TypeScript frontend
│   ├── components/
│   │   ├── CommitGraph/   # Topological lanes, bezier curves, density switcher
│   │   ├── ConflictResolver/ # 3-way visual merge conflict tool
│   │   ├── CommitComparison/ # 2-commit range diff & AI release notes
│   │   ├── Modals/        # StashModal, StashInspectorModal, FileHistoryModal, Reflog
│   │   ├── Navigation/    # Multi-repo top tab bar
│   │   ├── Staging/       # Staging list, hunk & line-level diff viewer
│   │   └── VirtualBranches/ # GitButler multi-branch lane manager
│   ├── api/client.ts      # Fast typed API client
│   └── utils/             # Graph layout, unified patch generator
├── extensions/vscode/     # VS Code Extension integration
└── .github/workflows/     # Multi-platform CI pipeline (Windows, Mac, Linux, VSIX)
```

### Running Locally from Source

#### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://rustup.rs/) (v1.78+)
- [Git](https://git-scm.com/) installed on system `PATH`

#### 1. Clone & Install
```bash
git clone https://github.com/zhikom/gitter.git
cd gitter
npm install
```

#### 2. Run in Native Desktop Mode (Tauri 2.0)
```bash
npm run tauri:dev
```

#### 3. Run in Web Development Mode (Vite + Server)
```bash
npm start
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

#### 4. Build Native Production Binaries
```bash
npm run tauri:build
```

#### 5. Build VS Code Extension
```bash
npm run vscode:build
cd extensions/vscode && npx @vscode/vsce package
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | **1-Click Undo** (Rollback last Git action via reflog) |
| `Ctrl+Click` / `Cmd+Click` | **Compare Two Commits** (Range diff on graph) |
| `Ctrl+P` / `Cmd+P` | **Quick Launch Command Palette** |
| `Ctrl+B` / `Cmd+B` | **Toggle Left Sidebar** |
| `Ctrl+S` / `Cmd+S` | **Toggle Staging & Diff Panel** |
| `Ctrl+Enter` / `Cmd+Enter` | **Commit Staged Changes** |
| `Double Click Branch` | **Checkout Branch** |
| `Drag Commit to Branch` | **Cherry-Pick Commit** |
| `Drag File Between Staging` | **Stage / Unstage File** |

---

## 📄 License

MIT License — free for personal, team, and commercial use. Contributions and PRs welcome!
