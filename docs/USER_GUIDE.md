# Gitter visual user guide

Gitter helps you inspect a repository, review changes, and work with Git from a
desktop window. The illustrations below use a sample repository; your branches
and files will be different.

## Find your way around

![Illustration of the Gitter workspace, with the main areas numbered](guide/workspace.svg)

1. **Repository tabs** keep several repositories open. Click a tab to switch.
2. **Toolbar** contains pull, push, branch, stash, undo, **Open in…**, the
   command palette, and settings. Narrow windows put some actions under **…**.
3. **Navigator** lists branches, pull requests, tags, and stashes. Use its
   filter to find a name and its settings icon to choose visible sections.
4. **Commit graph** shows history. Click a commit to inspect its files; click
   an uncommitted-changes row to return to the working tree.
5. **Working tree** separates staged and unstaged files. Click a file to review
   its diff in the center; its right-click menu offers more actions.
6. **Commit changes** holds the summary, optional description, and commit
   button. Only staged changes are included in an ordinary commit.

Drag the dividers to resize panels. **⌘B** on macOS or **Ctrl+B** on Windows
shows or hides the navigator; **⌘J / Ctrl+J** toggles the working tree.

## Open or clone a repository

1. Use the **+** beside the repository tabs, then choose **Open folder…**,
   **Find in folder**, or **Clone**. Recently opened repositories are listed
   under **Recent**.
2. To clone, enter a Git URL or browse an authenticated GitHub or Bitbucket
   account. Choose HTTPS or SSH and the destination folder, then clone.
3. Set a default destination in **Settings → General → Repositories**. Gitter
   also offers recently used clone folders.

GitHub browsing uses your signed-in GitHub CLI (`gh`). For Bitbucket Server or
Data Center, add the server and personal access token in **Settings →
Integrations**. The Bitbucket API token is separate from credentials used by
Git over HTTPS; Git uses your configured credential helper for those.

For SSH, use **Settings → SSH keys** to generate or copy a public key and open
the provider's key settings. The key lives in your normal SSH configuration and
can be used by command-line Git too. Share the **public** key, never the
private key.

## Browse branches and history

- Click a branch once to reveal its tip in the graph. Double-click it to check
  it out. Use the branch's right-click menu for more actions.
- In **Remote Branches**, the `origin/` prefix is hidden for readability.
  Branches from other remotes retain their remote name.
- Click a commit to see its files, then click a file for its diff. The commit
  and file context menus include actions such as compare, revert, and restore.
- To compare two commits, select one, then select the other while holding
  **⌘ / Ctrl** or **Shift**.
- Open **File history** from a file's diff or its context menu. Select a
  revision to see its change. **Compare with working tree** compares that
  version with the current tracked file, including staged and unstaged edits;
  switch back with **Show commit change**.
- **Blame** shows the most recent commit and author for each line. Lines that
  have not been committed yet are marked with a zero commit ID.

## Review, stage, and commit

![Illustration of a diff beside the staged-files and commit panels](guide/review-changes.svg)

1. Click an unstaged file. Green lines were added; red lines were removed.
   Use **Unified** or **Side by side** in the diff toolbar to change the view.
2. Use **Stage hunk** to stage a whole block. Click changed lines to select
   them, then use the selection actions or right-click to stage only those
   lines. You can unstage or discard changes from the corresponding views.
3. Check the **Staged** section before committing. You can move a file back
   using its unstage action.
4. Enter a summary and select **Commit to _branch_**. Add a description or
   choose **Amend** when needed. Push when you want to send commits to a remote.

Discard and revert operations change your working files. Review the selected
lines and confirmation before continuing. Whitespace-only changes can be
hidden, but partial staging is unavailable while whitespace is hidden.

## See history for selected lines

![Illustration of choosing source lines and reviewing the matching revisions](guide/selection-history.svg)

1. Open a file's diff and choose **History for selection** in its toolbar. You
   can also open it from **File history** or **Blame**.
2. Click one line, drag across lines, or click a line and **Shift-click**
   another to select a range. Select **Show history**.
3. Choose a revision on the left to see the change to those lines. Use
   **Open commit** to inspect all files in that commit, or **Choose lines** to
   change the selection.

The picker deliberately shows the file as committed at the selected revision
(or at `HEAD` for a working-tree file). Uncommitted edits are not part of the
history. A new file has no selection history until it has been committed.
Git traces the line range through its history, including supported renames;
very large and binary files are not available in this view.

## Pull requests

For a repository with a supported connected remote, open **Pull requests** in
the navigator. Select a PR to inspect its details or open it in the provider.
Bitbucket Server/Data Center drafts appear alongside open PRs. The **+** can
start a PR where the provider and branch support it. Gitter's Bitbucket
integration currently supports PRs within one repository; full review and
cross-repository PR workflows are not yet available.

If a Bitbucket token expires, use **Settings → Integrations → Update token**.
On macOS, Gitter stores the token unencrypted in a file restricted to your user
account, without using Keychain. Removing the connection deletes the saved
token. Other applications running as your user may be able to read it.

## Choose a theme and external apps

Open **Settings → General → Appearance** to choose **Gitter dark**, **Codex**
(neutral dark), or **Claude** (warm light with serif headings). The choice
applies immediately and is remembered. These are Gitter themes inspired by the
apps; they use available system fonts.

Use **Open in…** in the toolbar or a repository tab's context menu to open the
repository in an editor, coding app, or terminal. In **Settings → Open in**,
enable, reorder, configure, or add applications. For custom commands, put one
argument on each line and use `{path}` where the repository folder belongs.

## Shortcuts and recovery

`Mod` means **⌘** on macOS and **Ctrl** on Windows.

| Shortcut | Action |
| --- | --- |
| `Mod+P` | Open the command palette; choose **Check out branch or tag…** to search branches and tags. |
| `Mod+,` | Open settings. |
| `Mod+T` / `Mod+W` | Open or close a repository tab. |
| `Mod+Shift+N` | Create a branch. |
| `Mod+Shift+S` | Stash changes. |
| `Mod+Z` | Undo the last supported Git action. |
| `Mod+Enter` | Commit from the commit-message field. |
| `F5` | Reload the repository. |

For older Git actions, open **Reflog** from the command palette. Review what a
reset, restore, or revert will change before using it. Git operations use your
installed Git, including your hooks and signing configuration.
