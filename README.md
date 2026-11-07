# 🐙 Gitter — Fast, Open-Source GitKraken Alternative with AI Agents

**Gitter** is a high-performance, developer-first Git client engineered as a lightweight, modern alternative to GitKraken. It retains all the core Git workflow essentials—**visual commit graphs with Bezier curves, branch lanes, working tree staging, diff inspections, and stash/tag management**—while integrating an **AI Copilot and Autonomous Git Agent**.

Created using clean-room reverse-engineering techniques inspired by [`morluto/rea`](https://github.com/morluto/rea) and the recreate-and-grade pipeline from [`storytold/craft-anything`](https://github.com/storytold/craft-anything).

---

## ✨ Key Features

### 1. 📊 Interactive Visual Commit Graph (GitKraken Parity)
- **Multi-lane topological graph layout**: Automatically computes branch lanes with distinct vibrant colors (`teal`, `blue`, `purple`, `orange`, `pink`, `cyan`, etc.).
- **Smooth cubic Bezier curve rendering**: Parent and merge connections rendered with SVG curves and passing lane markers.
- **WIP Node (Uncommitted Changes)**: Interactive glowing dashed node at HEAD when working tree is dirty.
- **Ref Badges**: Visual indicators for `HEAD`, local branches, remote tracking branches, and tags.
- **Instant Search & Filter**: Filter commits in real time by message, author, SHA, or branch ref.
- **Commit Context Menu**:
  - Checkout commit / branch
  - Create branch or tag at any commit
  - Cherry-pick
  - Revert commit
  - Reset branch (Soft, Mixed, Hard)
  - Copy full SHA

### 2. 🌲 Working Tree Staging & Rich Diff Viewer
- **Side-by-side & Unified Diff Viewer**: Toggle between inline unified diff and side-by-side split view.
- **Working Tree Split**: Clear visual breakdown of **Staged** vs **Unstaged** files with status indicators (`M`, `A`, `D`, `U`, `!`).
- **Granular Controls**: Stage all, unstage all, individual stage/unstage, file discard, and hunk inspection.
- **AI File Explainer**: Instant button to explain specific file diffs in plain English.

### 3. 🤖 AI Integration & Autonomous Git Agent
- **✨ AI Conventional Commit Generator**: Analyzes staged diffs and generates concise commit summaries (`feat:`, `fix:`, `refactor:`, `docs:`) and bullet-point descriptions.
- **🔍 AI Commit & WIP Explainer (GitKraken Parity)**: Explains architectural impact, categorizes risk (Low/Medium/High), and suggests test plans for any commit or working diff.
- **⚡ AI Merge Conflict Resolver**: Detects Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), proposes clean resolution strategies with rationale, and lets you accept and stage with one click.
- **💬 Interactive AI Git Agent**:
  - Context-aware sidebar agent knowing current branch, uncommitted files, and repository state.
  - Natural language commands translated into safe Git operations (e.g. *"undo my last commit without losing files"* ➔ `git reset --soft HEAD~1`).
  - Interactive "Run" buttons to execute suggested commands directly.

### 4. 🔌 Flexible AI Provider Support
- **Built-in Smart Heuristic Engine**: Works 100% offline out-of-the-box with **zero API key required**.
- **Google Gemini**: Deep reasoning with Gemini 1.5 Flash and Pro.
- **OpenAI / Compatible**: GPT-4o, Claude proxies, Groq, DeepSeek.
- **Local Ollama**: 100% private, local model inference (`http://localhost:11434/v1`).

### 5. 🚀 Dual-Mode Desktop & Web Application
- **Electron Desktop Mode**: Native window framing, menu shortcuts, and directory pickers.
- **Web UI Mode**: Runs locally via Vite + Express for browser-based access and development.

---

## 🛠️ Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend / Engine**: Node.js, Express, Native Git CLI child process bridge
- **Desktop Runtime**: Electron 34
- **Layout & Algorithms**: Custom topological sorting, Bezier lane router, Unified diff parser

---

## 🏁 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/) installed and available on `PATH`

### 1. Installation
```bash
git clone https://github.com/your-username/gitter.git
cd gitter
npm install
```

### 2. Run in Web Mode (Vite + Backend)
```bash
npm start
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Run in Desktop Electron Mode
```bash
npm run electron:dev
```

---

## ⌨️ Shortcuts & Operations
| Action | Description |
|---|---|
| **Pull / Push** | Top toolbar with standard merge or rebase options |
| **Branching** | Create branch from any commit or current HEAD |
| **Stash / Pop** | Save working changes to stash and pop most recent |
| **AI Agent** | Click **AI Agent** pill in top header to open conversational dock |
| **Settings** | Configure Gemini API Key, OpenAI endpoints, or Local Ollama |
