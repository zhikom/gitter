# 🐙 Gitter v1.0.0 — The Elite Open-Source Git Client

We are thrilled to announce the initial release of **Gitter** — an ultra-high performance, developer-first Git client that brings together the best capabilities of **GitKraken**, **Sublime Merge**, **GitButler**, **Fork**, and **JetBrains (IntelliJ/Rider)** into a lightweight, unified developer tool.

Built on a **12.1 MB native Tauri 2.0 Rust** backend, Gitter delivers instant startup, minimal memory footprint, and full compatibility with your existing Git credentials, SSH keys, and GPG signing.

---

### ✨ What's Inside

#### 📊 Interactive Visual Commit Graph *(GitKraken Parity)*
- **Topological Multi-Lane Layout**: Automatically computes distinct color-coded lanes for branches with smooth cubic Bezier merge and fork curves.
- **Dynamic Density Switcher**: Toggle instantly between **Compact** (24px), **Normal** (32px), and **Comfortable** (40px) row heights with persistent settings.
- **Sublime Merge Search Query Syntax**: Filter commits in real time by `author:`, `hash:`, `sha:`, `message:`, `msg:`, or free-text query.
- **Interactive Drag-and-Drop Cherry-Picking**: Drag any commit directly onto a branch pill in the sidebar to cherry-pick instantly.
- **Two-Commit Range Diff**: `Ctrl+Click` / `Cmd+Click` any two commits on the graph to view changed files, diff comparisons, and generate AI release notes.
- **Full Context Operations**: Checkout, Branch/Tag creation, Soft/Mixed/Hard Reset, Revert, Cherry-pick, Interactive Rebase, and Copy SHA.

#### 🔀 GitButler Multi-Branch Stacking *(Virtual Branches)*
- Work on multiple features concurrently in the same working directory without stashing, WIP commits, or branch switching.
- Partition staging area changes directly into independent virtual branch lanes with isolated commit boxes.

#### 📦 JetBrains Shelve & Unshelve *(Persistent Named Shelves)*
- **Shelve Changes**: Save dirty changes into named, persistent shelves in `.git/gitter/shelves/` with custom descriptions and selective file checklists.
- **Rebase-Immune**: Unlike standard Git stashes, shelves are never dropped, indexed out-of-order, or broken by rebases.
- **Visual Stash & Shelf Inspector**: Inspect modified files, addition/deletion stats (`+N / -M`), and diffs before applying or popping.

#### 📜 Interactive File History Timeline
- View every commit revision that touched a specific file across the repository's lifetime with instant split/unified diffs.

#### ⚡ Visual 3-Way Merge Conflict Resolver
- 3-column conflict resolver: **Ours (Current)** | **Live Editable Output** | **Theirs (Incoming)**.
- 1-click block pickers (*Use Ours*, *Use Theirs*, *Use Both*), live syntax highlighting, and conflict marker tracking.

#### ✂️ Line-Level & Hunk Staging *(Sublime Merge Parity)*
- Stage, unstage, or discard individual hunks and selected line ranges with a floating action toolbar.

#### ⏪ 1-Click Undo (`Ctrl+Z`) & Reflog Timeline
- Rollback accidental branch checkouts, merges, or resets with one shortcut (`Ctrl+Z`).
- Visual Reflog inspector with soft/hard resets and checkout actions.

#### 🤖 AI Copilot & Autonomous Git Agent
- Conventional commit message generator (`feat:`, `fix:`, `refactor:`, `docs:`).
- AI commit explainer, architectural impact analyzer, and release notes generator.
- Multi-provider support: **Anthropic Claude 3.7 / 3.5 Sonnet**, **OpenAI GPT-4o / o1 / o3-mini**, **Google Gemini 2.0 Flash / Pro**, **Local Ollama**, and Custom OpenAI endpoints.

#### 💻 Visual Studio Code Extension (`gitter-vscode`)
- Embedded Webview running inside Visual Studio Code with two-way message passing and Command Palette shortcuts.

---

### 📦 Platform Binaries & Downloads

| Platform | Package | Description |
|---|---|---|
| **Windows** | `gitter.exe` / `.msi` / `.exe` (NSIS) | 64-bit installer & standalone executable |
| **macOS** | `.dmg` / `Gitter.app` | Universal binary (Apple Silicon M-series & Intel) |
| **Linux** | `.AppImage` / `.deb` | Portable AppImage & Debian/Ubuntu package |
| **VS Code** | `gitter-vscode-1.0.0.vsix` | Native Visual Studio Code extension |

---

*Full source code & documentation available at [https://github.com/zhikom/gitter](https://github.com/zhikom/gitter).*
