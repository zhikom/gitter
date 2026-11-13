# Changelog

## [Unreleased]

## [1.7.1] - 2026-11-13

### Navigation

- Hide the `origin/` prefix in the remote-branches list while keeping the full
  branch name for Git actions. Other remote names remain visible.

### Downloads

- Windows x64 and macOS ARM64 (Apple Silicon) installers are available. The
  Windows installer is unsigned; the Mac app is ad-hoc signed but not
  notarized, so the operating system may show a security warning.

## [1.7.0] - 2026-11-13

### History and appearance

- Trace a selected line or range through committed file history, including
  renames, and preview the change at each revision. Open the full commit from
  the history view. Selection history uses committed source; uncommitted-only
  lines have no history yet.
- Compare a file revision with the current working tree, including staged and
  unstaged changes, directly from file history.
- Choose Gitter dark, a Codex-inspired dark theme, or a Claude-inspired warm
  light theme with matching typography in Settings → General → Appearance.
- Give the diff more room in smaller windows and expand the graph when opening
  an older commit from file or selection history.
- Add an illustrated user guide, linked from the README and Settings → About.

### Downloads

- Windows x64 and macOS ARM64 (Apple Silicon) installers are available. The
  Windows installer is unsigned; the Mac app is ad-hoc signed but not
  notarized, so the operating system may show a security warning.

## [1.6.1] - 2026-11-13

### Bitbucket connection

- Remember Bitbucket personal access tokens across Gitter restarts without
  using the OS Keychain. On macOS, tokens are stored unencrypted in files
  restricted to the current user; on Windows they are encrypted for the user.
- Update an existing token in Integrations, or remove the connection to delete
  its saved token. Existing session-only connections need one token re-entry.

### Downloads

- Windows x64 and macOS ARM64 (Apple Silicon) installers are available. The
  Windows installer is unsigned; the Mac app is ad-hoc signed but not
  notarized, so the operating system may show a security warning.

## [1.6.0] - 2026-11-13

### Pull requests and navigation

- Show open Bitbucket Server / Data Center pull requests, including drafts, in
  the repository sidebar and open their details or Bitbucket page. Indicate
  when a session token is needed or the server cannot be reached.
- Keep branches and tags behind one **Check out branch or tag** command in
  the command palette, with a searchable list after selecting it.
- Add a configurable **Open in…** menu for VS Code, Rider, Codex, Claude Code,
  Terminal, and custom applications or commands.

### Downloads

- Windows x64 and macOS ARM64 (Apple Silicon) installers are available. The
  Windows installer is unsigned; the Mac app is ad-hoc signed but not
  notarized, so the operating system may show a security warning.

## [1.5.0] - 2026-11-13

### GitHub and navigation

- Detect and reuse an existing GitHub CLI login, browse repositories for HTTPS
  or SSH cloning, create private or public repositories, and open GitHub's SSH
  key settings. GitHub HTTPS operations can use the existing `gh` credentials.
- Select a local or remote branch with one click to reveal its tip in the graph;
  double-click to check it out.
- Keep Bitbucket integration tokens in memory for the current session instead
  of reading or writing the operating system Keychain. Reconnect after restart.

### Downloads

- Windows x64 and macOS ARM64 (Apple Silicon) installers are available. The
  Windows installer is unsigned; the Mac app is ad-hoc signed but not
  notarized, so the operating system may show a security warning.

## [1.4.2] - 2026-11-13

### Repositories and coding apps

- Browse and search a connected Bitbucket Server or Data Center directly in
  the clone dialog, with SSH and HTTPS clone URL choices and pagination.
- Choose a clone destination from the configured default, previously used
  clone folders, or the parent folders of recently opened repositories. The
  most recent successful clone destination is filled in automatically.
- Open a repository in a new Codex or Claude Code desktop session from the
  repository menu, a repository tab, or the recent repositories list.
- Generate an Ed25519 SSH key in Settings, with an optional passphrase, without
  overwriting existing files. Copy a public key and open a connected Bitbucket
  server's SSH-key page to paste it. The browser may ask you to sign in separately.

### Downloads

- Windows x64 and macOS ARM64 (Apple Silicon) installers are available. The
  Windows installer is unsigned; the Mac app is ad-hoc signed but not
  notarized, so the operating system may show a security warning.

## [1.3.2] - 2026-11-13

### Commit and working-tree changes

- Select a commit to inspect its details and changed files in a side panel,
  then open a file's diff in the main workspace. Right-click files for restore,
  apply, revert, history, blame, editor, and file-manager actions.
- View additions and deletions by file and hunk. Stage, unstage, or discard
  working changes by hunk or selected line; apply or reverse historical changes
  in the working tree. Partial actions are unavailable for renamed or binary
  historical files.

### Repositories and integrations

- Clone repositories over HTTPS or SSH into a configurable default folder,
  inspect SSH keys and agent status, and reveal repositories in Finder or Explorer.
- On macOS, connect to Bitbucket Server or Data Center using a token stored in
  Keychain; browse repositories and pull requests, create pull requests within
  a repository, and clone using HTTPS or SSH.
- Package the backend with the desktop app, use native folder dialogs, and
  open a cloned repository at its resolved destination. Cloning, file staging,
  and commits use the native Rust integration with system Git.

### Reliability and distribution

- Improve Git handling, settings, diff tools, agent workflows, and automated
  behavior tests. Remove the obsolete VS Code extension.
- Release installers for Windows x64 and macOS ARM64 (Apple Silicon).
  The macOS app is ad-hoc signed and not notarized; the Windows installer is
  not code-signed, so the operating system may show a security warning.
