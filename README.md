# Gitter

<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Gitter" />
</p>

<p align="center">
  <a href="https://github.com/zhikom/gitter/releases"><img src="https://img.shields.io/github/v/release/zhikom/gitter?color=0d9488&label=release" alt="Release"></a>
  <a href="https://github.com/zhikom/gitter/actions"><img src="https://img.shields.io/github/actions/workflow/status/zhikom/gitter/build.yml?color=0d9488&label=build" alt="Build"></a>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT">
</p>

A desktop git client for Windows and macOS, with a review workflow for code
written by AI coding agents.

## What it does

**Everyday git**
- Commit graph of all branches, tags and remotes, with search, drag a commit
  onto a branch to cherry-pick it, and a context menu for checkout, branch,
  tag, revert, reset, interactive rebase and comparing two commits.
- Select a commit to inspect its files in the side panel; select a file to
  review its diff in the main workspace. The file menu can restore selected
  files from that commit or apply and reverse its changes in the working tree.
- Working tree: stage, unstage or discard whole files, hunks or single lines;
  unified or side-by-side diffs; per-file and per-hunk change counts; blame;
  file history.
- Branches, tags, remotes, stashes (pick which files to stash, or keep the
  changes), worktrees, submodules, gitflow, pull requests through the GitHub CLI.
- Undo the last action (`Ctrl+Z`), and a reflog to get back anything else.
- Conflict resolution: pick yours, theirs or both per conflict, or edit the
  result.
- Lanes: group the working tree's changes by the branch they belong to and
  commit each group to its own branch without switching.
- Several repositories open in tabs.
- Clone over HTTPS or SSH into a configurable default folder (`~/repos` by
  default); reuse recent clone destinations, generate, inspect, and copy SSH
  public keys, and reveal repositories in Finder or Explorer.
- Open a repository in Codex or Claude Code from the repository menu or tab
  menu, with the repository folder selected for a new coding session.
- Connect GitHub using an existing GitHub CLI login to browse, clone, and create
  repositories and work with pull requests. Clone over HTTPS or SSH.
- Connect Bitbucket Server / Data Center with a personal access token to browse
  repositories and pull requests, create a pull request within one repository,
  and search from the clone dialog. The token is kept only in memory for the
  current Gitter session. Copy a public SSH key and open either provider's
  SSH-key page from Settings when you need to add it.
- Single-click a branch to reveal its tip in the graph; double-click to check it out.

**AI agents**
- Start an agent in its own branch and worktree (`agent/<harness>-<task>`), or
  let Gitter pick up `agent/*` branches it finds.
- Review inbox: what each agent changed against the branch it started from,
  including files it has not committed. Approve, approve and merge, request
  changes, reject single hunks, save a checkpoint and roll back to it.
- Collisions: a warning when two agents change, or claim, the same file.

**AI assistance** (optional; Anthropic, OpenAI, Gemini, DeepSeek, Ollama or any
OpenAI-compatible endpoint): commit messages, explanations of changes,
conflict resolution, pull request descriptions, and an assistant that can
suggest git commands. The API key stays in your user profile and is never
sent to the UI.

## Install

Download the installer for your platform from
[Releases](https://github.com/zhikom/gitter/releases): the `-setup.exe` for
Windows x64, or the `.dmg` for macOS ARM64 (Apple Silicon). The macOS app is
ad-hoc signed but not notarized, and the Windows installer is unsigned, so the
operating system may show a security warning. Gitter checks for new releases at
startup and can install them (Settings → General).

Gitter uses the `git` on your `PATH`, with your own credentials, hooks and
signing setup. Pull requests need the [GitHub CLI](https://cli.github.com/)
signed in.

## Keyboard shortcuts

`Mod` is `Ctrl` on Windows and `Cmd` on macOS. The command palette (`Mod+P`)
lists every command with its shortcut.

| Shortcut | Action |
|---|---|
| `Mod+P` | Command palette |
| `Mod+L` / `Mod+T` | Open a repository |
| `Mod+W` | Close the repository tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Mod+Z` | Undo the last git action |
| `Mod+Enter` | Commit (in the commit message) |
| `Mod+Shift+N` | New branch |
| `Mod+Shift+S` | Stash changes |
| `Mod+B` / `Mod+J` | Toggle sidebar / working tree |
| `Mod+Shift+A` | Toggle the assistant |
| `Mod+Shift+K` / `Mod+Shift+F` / `Mod+Shift+L` | Review inbox / agent fleet / compare the next agent |
| `Mod+,` | Settings |
| `F5` | Reload the repository |

## How it is built

```
src-tauri/   Tauri 2 desktop shell (Rust): starts the backend, opens the window
server/      Backend (TypeScript, Express): runs git and gh, agent review, AI
shared/      Types and rules both sides use (diff patches, agent branch names…)
src/         UI (React, Vite, Tailwind)
```

The desktop app ships the backend as a sidecar executable compiled with Bun.
It listens on a random loopback port, requires a per-launch token, and exits
with the app.

In the desktop app, cloning, file staging and commits run through Rust and
system Git. The other Git operations and services still use the sidecar; the
Rust migration and GitKraken feature parity are ongoing. SSH authentication
uses the system configuration and agent. Bitbucket API tokens stay in memory
and must be re-entered after restarting Gitter; Git HTTPS credentials are
separate and use your configured Git credential helper. For GitHub, Gitter can
reuse existing GitHub CLI authentication without changing Git configuration.
Bitbucket Cloud, cross-repository pull requests and pull-request reviews are
not yet implemented.

Sidecar operations use `POST /api/<name>` with a JSON body. The handler map in
`server/handlers.ts` is the contract: the UI's client
(`src/api/client.ts`) is typed from it, so a changed handler is a type error in
the UI. git always runs without a shell, with `--end-of-options` before
user-supplied names.

## Development

Requires Node.js 20+, git, and for desktop builds Rust and
[Bun](https://bun.sh/).

```bash
npm install
npm start            # backend + UI at http://localhost:5173
npm test             # behavior tests against real git repositories
npx tsc --noEmit     # type check (UI, backend, shared)
npm run tauri:dev    # desktop app in development
npm run tauri:build  # installers for this platform
```

## License

MIT
