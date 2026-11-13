# Changelog

## [Unreleased]

- Correct Windows account identification and permissions when generating SSH keys.

## [1.4.1] - 2026-11-13

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
