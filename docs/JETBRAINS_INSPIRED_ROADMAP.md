# A JetBrains-inspired configuration roadmap for Gitter

Research snapshot: 13 November 2026, against Gitter commit `2c6668273fd7` and the font picker added alongside this roadmap. JetBrains references below describe IntelliJ IDEA and the IntelliJ Platform; exact options can differ between products, editions, operating systems, and versions. Gitter is a Git client, so the aim is to borrow useful interaction patterns, not reproduce an IDE.

**Progress, 14 November 2026:** Settings search, General-section resets, and
validated selective backup are available; search reaches many individual
controls across settings pages but does not index every dynamic control. Alternate-branch lane
commits use Git's commit machinery with a separate index, so Git hooks and
signing apply. Interface zoom, text size, system appearance, code size, and line
height are configurable. App-level and commit-field shortcuts, up to six toolbar actions, and
named in-window panel layouts can be customized. Personal and local repository
templates support commit messages, branch names, and pull request descriptions;
Git's commit template is a fallback. Explicit local actions show their arguments
and output, and validated data-only packs can contribute constrained colors,
safe view shortcuts, and literal templates. The PR form can explicitly read a
GitHub default template or attempt a Bitbucket Data Center template; the latter
uses an undocumented UI endpoint and its behavior with an actual configured
template has not been verified. Common opaque theme text/surface pairs are
checked for contrast, but overlays, states, and all screen layouts have not
been audited. Detached windows, full provider template selection, extension
distribution, and a plugin runtime remain future work. Executable plugins
remain an explicit research and security gate.

## Recommendation

Make Gitter easy to adapt in this order: **settings and Git correctness → typography and appearance → actions and layouts → templates and external tools → declarative extension packs → an evidence-based decision on executable plugins**. Each stage should be useful on its own. Detached windows and executable plugins are high-cost follow-ons, not prerequisites for a configurable workspace.

The initial audit found that a lane committing to a different branch used
`git commit-tree`, bypassing commit hooks. The follow-up uses `git commit` with a
temporary linked-worktree Git directory, the target branch, and a separate index;
hooks run in the original working directory. A branch checked out in another
worktree is rejected. See [`server/virtualBranches.ts`](../server/virtualBranches.ts),
[`src-tauri/src/git_core.rs`](../src-tauri/src/git_core.rs), and
[Git's hook documentation](https://git-scm.com/docs/githooks).

## What JetBrains makes configurable

| Area | Documented IntelliJ IDEA behavior | Opportunity for Gitter |
| --- | --- | --- |
| Appearance and fonts | The UI theme is separate from the editor color scheme; UI, editor, and console fonts can be configured separately. Editor font settings include size, line height, ligatures, weights, and fallback. Themes can follow the OS. [Colors and fonts](https://www.jetbrains.com/help/idea/configuring-colors-and-fonts.html), [Font settings](https://www.jetbrains.com/help/idea/settings-editor-font.html), [Appearance](https://www.jetbrains.com/help/idea/settings-appearance.html) | Offer independent interface and code typography, light/dark/system themes, and readable diff colors. Gitter does not need a full language editor's font controls on day one. |
| Settings and sharing | Settings can be searched; JetBrains distinguishes IDE settings from project settings. Backup and Sync and selective export/import share settings, while project files can be shared via version control. [Search Everywhere](https://www.jetbrains.com/help/idea/searching-everywhere.html), [Project settings](https://www.jetbrains.com/help/idea/configure-project-settings.html), [Backup and Sync](https://www.jetbrains.com/help/idea/sharing-your-ide-settings.html) | Search settings and identify their scope; export selected non-secret choices first. Do not silently put private machine settings or executable configuration in a repository. |
| Actions and surfaces | Keymaps associate actions with shortcuts and can be customized; menus and toolbars can be rearranged. [Keymaps](https://www.jetbrains.com/help/idea/configuring-keyboard-and-mouse-shortcuts.html), [Menus and toolbars](https://www.jetbrains.com/help/idea/customize-actions-menus-and-toolbars.html) | Make Gitter's existing command IDs the basis for editable shortcuts, a customizable toolbar, and clear conflict handling. |
| Tool windows | Panels can be moved, resized, hidden, detached, and restored from saved layouts. [Arrange tool windows](https://www.jetbrains.com/help/idea/manipulating-the-tool-windows.html), [View modes](https://www.jetbrains.com/help/idea/viewing-modes.html) | Begin with named in-window layouts and keyboard-accessible panels; investigate actual separate windows only after state and lifetime semantics are defined. |
| Diff and notifications | The diff viewer exposes unified/side-by-side views and options such as whitespace handling and synchronized scrolling; notifications can be configured by event group. [Diff viewer](https://www.jetbrains.com/help/idea/differences-viewer.html), [Notifications](https://www.jetbrains.com/help/idea/notifications.html) | Make review display choices consistent across Gitter's diff surfaces and let users reduce low-priority noise without hiding failures. |
| Templates and tools | File templates have IDE or project scope, and live templates have variables and contexts. External tools can use context macros and be invoked from actions, context menus, or shortcuts. [File templates](https://www.jetbrains.com/help/idea/settings-file-and-code-templates.html), [Live templates](https://www.jetbrains.com/help/idea/creating-and-editing-live-templates.html), [External tools](https://www.jetbrains.com/help/idea/configuring-third-party-tools.html) | Focus on commit messages, pull requests, branch names, and task prompts. Start with literal, previewable substitutions and explicitly launched local tools. |
| Extensions | IntelliJ plugins register implementations against defined extension points, declare compatibility, and can be enabled or disabled through plugin management. [Extensions](https://plugins.jetbrains.com/docs/intellij/plugin-extensions.html), [Plugin descriptor](https://plugins.jetbrains.com/docs/intellij/plugin-configuration-file.html), [Managing plugins](https://www.jetbrains.com/help/idea/managing-plugins.html) | First stabilize a few Gitter-owned contracts and declarative contributions; do not assume IntelliJ's plugin runtime or ecosystem can be reused. |

## Gitter today: foundations and gaps

The following observations come from the checked-in source and current working tree, not a claim about every released build.

- **Settings:** [`src/preferences.ts`](../src/preferences.ts) stores typed installation preferences in individual `localStorage` keys, with defaults and load-time normalization. [`SettingsModal.tsx`](../src/components/Modals/SettingsModal.tsx) separates installation and repository sections, with search and portable settings backup. Repository Git settings and Gitter's own settings are distinct in [`server/settings.ts`](../server/settings.ts); Gitter's repo store uses the common Git directory and is shared by linked worktrees, not versioned in the working tree ([`server/repoStore.ts`](../server/repoStore.ts)). Search reaches many individual controls but does not index each dynamically generated entry.
- **Appearance:** Gitter dark, Codex, and Claude themes apply immediately. Separate interface and code font choices include installed-font discovery and optional locally sourced Anthropic Sans. Whole-interface zoom, independent text size, diff font size, line height, tab width, wrapping, whitespace handling, and graph density are configurable ([guide](USER_GUIDE.md)). The PostCSS pass still maps some existing utilities to theme tokens and special cases; automated contrast checks cover common opaque text and surfaces rather than every state.
- **Commands and layout:** [`src/commands.ts`](../src/commands.ts) and [`App.tsx`](../src/App.tsx) provide app-level editable shortcuts and customizable toolbar actions. The commit editor has a separately scoped editable shortcut ([`CommitBox.tsx`](../src/components/Staging/CommitBox.tsx)); other contextual controls are not all configurable. Panel widths and visibility can be saved in named installation-wide layouts. A single `main` Tauri window remains ([`tauri.conf.json`](../src-tauri/tauri.conf.json)).
- **Customization and execution:** Open in entries and separately configured local actions run only on explicit launch. Local actions use argument arrays, expose output and cancellation, and have the user's OS permissions; they are not a sandbox. Data-only packs have a constrained manifest and cannot add commands or executable code. The commit form can explicitly insert Git's configured template before sending a message with `-F -` ([`CommitBox.tsx`](../src/components/Staging/CommitBox.tsx), [`git_core.rs`](../src-tauri/src/git_core.rs)); Git itself does not apply an editor template when `-F` supplies the message ([`git commit`](https://git-scm.com/docs/git-commit)).
- **Trust boundary:** The desktop app injects a per-launch backend location and token into its main webview, and the sidecar serves authenticated Git operations over loopback ([`lib.rs`](../src-tauri/src/lib.rs), [`src/api/client.ts`](../src/api/client.ts), [`server/index.ts`](../server/index.ts)). The current Tauri config sets `csp` to `null`, and the capability file targets the main window ([`tauri.conf.json`](../src-tauri/tauri.conf.json), [`default.json`](../src-tauri/capabilities/default.json)). Loading untrusted extension code in that webview would place it alongside powerful app access; a token by itself is not isolation from code that can read it.

## Phased delivery

Sizes below are **rough engineering effort for one person familiar with Gitter**, including implementation and focused verification, not calendar commitments. `S` ≈ 2–5 days, `M` ≈ 1–3 weeks, `L` ≈ 3–6 weeks, `XL` > 6 weeks or unknown. Work can overlap only where dependencies are satisfied; reassess after a small technical spike. All phases target the supported Windows x64 and macOS ARM64 desktop builds.

### Phase 0 — reliable foundations and Git semantics (P0)

**User outcome:** Settings have a predictable scope and can be found and recovered; users understand when Git checks will run. **Size:** M–L; uncertainty is highest for migration and lane behavior.

1. **Settings catalog and migration.** Define a typed setting registry with stable IDs, labels/search terms, defaults, validation, sensitivity/export policy, and scope. Begin by wrapping/migrating existing preferences rather than replacing them all at once. Specify precedence as session override → applicable repository/worktree override → installation preference → default, but only enable a scope for settings that need it. Show the effective value and where an override comes from. Keep Git-owned values in Git configuration and Gitter-owned repo data in the existing repo store unless a deliberate migration says otherwise.
2. **Find, reset, and export.** Search labels and descriptions from the settings UI, navigate to the relevant control, and reset one setting or a section with an explicit action. Offer versioned JSON export/import with a preview of changes, validation, and cancellation. Default to an allowlist of portable appearance/keymap settings; exclude tokens, AI keys, backend tokens, SSH material, integration credentials, absolute paths, recent repositories, and command execution settings. Adding sensitive or machine-specific categories later requires explicit opt-in and clear labeling. Avoid any OS Keychain use.
3. **Audit Git hooks and lanes.** Inventory which paths use `git commit` and which create commits with plumbing. Write an integration test with a failing `pre-commit` and `commit-msg` for ordinary commits and both lane cases, plus `core.hooksPath` and linked worktrees. Until a correct implementation exists, make the alternate-branch lane behavior visible before the commit. Compare using a real temporary worktree/`git commit`, disabling that lane operation when hooks are required, and preserving the current behavior with an explicit notice. Select a design only after testing index isolation, hook-modified messages, signing, worktree cleanup, concurrent ref movement, and failure recovery; do not hand-run a subset of Git hooks and call it equivalent.

**Acceptance:** Existing users keep valid preferences after upgrade and malformed values fall back safely; scope and reset are understandable; export/import is atomic or recoverable and never includes excluded fields; ordinary hook failures remain visible and do not create a commit; lane tests accurately describe the selected behavior. A fresh install and a migration from current keys are both covered.

### Phase 1 — typography, themes, and review readability (P1)

**User outcome:** A user can make the interface and code readable independently and carry those choices across review screens. **Size:** M–L, depending on theme-token cleanup.

1. Extend the current independent **UI and code font-family** controls with independent **UI size** and **code size/line height**, additional fallback choices, and richer previews. Apply code typography consistently to diff, conflict, blame, and relevant history/review code views; make it clear when a view does not yet support a control. Confirm discovery and fallback work on both targets before promising OS-wide coverage. Start ligatures off for diffs, where character alignment matters; test opt-in rendering before adding a toggle.
2. Introduce semantic tokens for backgrounds, text, focus, borders, selection, graph lanes, add/delete, syntax, and warnings. Replace literal colors and color-rewriting dependencies incrementally, with a component inventory so new themes do not need many selector-specific patches. Keep the existing three themes stable; add system light/dark following by mapping each mode to a user-selected built-in theme.
3. Add accessible interface scale and density presets with reset. Keep graph density separate; offer keyboard-accessible resizing and avoid clipping at larger sizes and minimum window dimensions. Honor the existing reduced-motion behavior. Improve diff controls only where supported by the actual renderer, such as consistent wrap and whitespace settings; scope features like synchronized split scrolling to an implementation spike.

**Acceptance:** Changing the UI font does not change code typography and vice versa; choices survive restart and handle missing fonts. Check text, focus, selections, add/delete cues, and controls in all built-in themes at normal and enlarged scale, including the minimum supported window size. Use contrast checks against the chosen accessibility target and ensure color is not the only add/delete indicator.

### Phase 2 — actions, panels, and layouts (P1/P2)

**User outcome:** Users can drive Gitter with their preferred keys and save a review-oriented workspace. **Size:** L; detachable windows are a separate XL investigation.

1. Extend the existing command model with stable IDs, context/availability, default shortcuts, and user overrides. Move context-specific shortcuts into a compatible scoped action mechanism rather than assuming the current app-level registry covers them all. Add a searchable keymap editor with conflict detection, platform-reserved shortcut handling, reset per action, and predictable precedence for dialogs, text inputs, and active panels. Palette, toolbar, menus, and shortcuts must display and invoke the same action state.
2. Allow choosing, ordering, and hiding safe toolbar actions while retaining access via the palette and a restore-defaults action. Add keyboard focus/toggle commands for navigator, graph, changes, diff, agent rail, and assistant. Define a small panel contract—stable ID, title, availability, min size, visibility, and state owner—before moving layout code out of `App.tsx`.
3. Add named **in-window** layouts such as Review and History, plus Save current and Restore default. Store panel positions/widths/visibility separately from repository selections and unsaved drafts. Choose explicitly whether a layout is installation-wide or a local per-repository override; never sync an absolute monitor position as a portable setting. Test narrow windows and recovery from missing/renamed panels.
4. **Investigate, then decide on detached diff/review windows.** Prototype one read-only diff on a second monitor. Define who owns the repository and selection, how changes and draft comments are synchronized, what happens when either window closes, how to prevent duplicate writes/stale actions, how the sidecar stays alive, and how off-screen windows return after monitor changes. Give each window only the capabilities it needs. Ship only if the prototype meets these conditions on both platforms.

**Acceptance:** Remapped shortcuts and toolbar actions match the palette and do not steal typing or dialog keys; conflicts are shown before saving. Layouts survive restart, can be reset without losing drafts, and recover after resize or missing panels. Any detached-window release demonstrates correct close/reopen, monitor removal, repository switching, and concurrent update behavior.

### Phase 3 — Git-aware templates and explicit local tools (P2)

**User outcome:** Repetitive Git and review work starts from a useful, editable draft; users can invoke their own tools with context. **Size:** M–L. Depends on Phase 0 scope and Phase 2 action contracts.

1. Start with **commit-message templates**, then branch naming and pull-request descriptions. Support personal and explicit repository-scoped templates; define precedence, show the source, and allow opt-out per draft. Read Git's effective `commit.template` deliberately as an input to the UI when appropriate; don't assume Git fills it while Gitter passes `-F -`. Preserve user edits across repo switches and template changes, and never overwrite an amend message or existing draft automatically. Test comment lines, encoding, missing files, hook edits, merge/amend flows, and Git configuration precedence.
2. Use a small, documented substitution grammar with an allowlist such as branch name, repository name, date, and user-provided fields. Preview the expanded text, leave unknown variables visible or report an error, and impose size limits. No arbitrary scripts, network calls, or template expressions in the initial format. Before adding PR templates, inspect each provider's existing template conventions so Gitter does not overwrite or duplicate provider content.
3. Evolve **Open in** into optional user-created local actions: executable plus argument array, working directory, bounded context variables, manual launch, visible output/exit status, cancellation, and per-action enable/disable. Register each with the command system and allow shortcuts. Preserve existing Open in entries on migration. Treat repository-supplied commands as untrusted: show exact executable, arguments, working directory, and source before explicit approval; no silent automatic execution or unsafe shell interpolation. Do not deliberately pass stored credentials in arguments or environment. These actions run with the user's OS privileges and can potentially access that user's files and credentials; explicit launch is not a sandbox. Platform-specific launch behavior, particularly Windows command wrappers, needs separate testing.
4. Keep **Git hooks**, **manual external actions**, and any future **Gitter events** distinct. Git determines its own hook paths and behavior; Gitter must not silently add `--no-verify`, alter `core.hooksPath`, or run a hook twice. If automatic Gitter event hooks are proposed later, require an explicit opt-in per repository and event, permissions, timeouts, observable results, and a decision on blocking versus advisory behavior.

**Acceptance:** A template only replaces a blank or explicitly selected draft; its preview matches the message sent to Git, subject to Git hooks modifying it. Global/repository precedence is clear, and missing/invalid templates fail safely. A local action receives exact arguments even with spaces and metacharacters; untrusted project configuration cannot execute merely by opening a repository.

### Phase 4 — declarative packs and component contracts (P2/P3)

**User outcome:** Users can share a theme, keymap, or template bundle and remove it without losing their personal settings. **Size:** M–L after Phases 0–3; validate demand before building distribution infrastructure.

1. Define versioned **data-only packs** with a stable ID, version, author, compatibility range, declared contribution types, and a manifest. Initial types: semantic theme tokens, keymap overrides, and literal templates. Validate schema, size, names, duplicate IDs, and allowed values; no JavaScript, HTML, CSS injection, binary, command execution, or external resources in a pack. Import locally with a preview; enable, disable, remove, and reset without corrupting underlying preferences. Start with bundled first-party examples.
2. Stabilize narrow internal interfaces for actions, panel descriptors, theme tokens, and settings registration. Test them with at least two built-in features before calling them public APIs. Use a host-owned UI with constrained values for contributions; do not expose React component internals as a public extension contract yet.
3. If sharing demand exists, define integrity verification, publisher identity, update/rollback, revocation, compatibility reporting, and support ownership before considering a hosted catalog. A signature can establish provenance and integrity; it does not prove code or content is safe.

**Acceptance:** Invalid or incompatible packs are rejected without partial application; disable/removal restores the prior effective settings; an app upgrade either migrates a compatible pack or disables it with a clear reason. No pack can cause a network request or start a process merely by being installed or rendered.

### Phase 5 — executable plugins and automation: gated discovery (P3)

**User outcome under investigation:** A third party could add a Git provider or a review action without forking Gitter. **Size:** XL/unknown; this is a research gate, not a delivery promise. Proceed only after real extension use cases cannot be met by data packs or manual tools and an owner can support a public API.

1. Write a threat model covering repository data, credentials, the loopback token, network access, OS processes, plugin updates, malicious packages, resource exhaustion, and the renderer. Restrict the app CSP and audit IPC, authorization, origins, and event streams before exposing any extensibility. Tauri capabilities constrain permissions for designated windows/webviews, but are not by themselves a sandbox for arbitrary native or sidecar code; test the actual boundary rather than claiming isolation from a permission prompt. [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Tauri CSP](https://v2.tauri.app/security/csp/).
2. Compare an OS-sandboxed process or a capability-limited runtime with a host-mediated, versioned RPC protocol. Run untrusted code outside the main webview and privileged sidecar, do not pass the backend token or inherited secrets, default-deny capabilities, and enforce permissions in the host. A separate ordinary process without OS-level confinement is **not** a security sandbox. Verify achievable filesystem, network, process, and resource limits on both macOS and Windows before promising them.
3. Prototype one read-only contribution, for example a commit metadata provider. Require bounded inputs/outputs, timeouts, cancellation, crash containment, permission revocation, install/update review, safe mode, API compatibility tests, diagnostics without secret leakage, and a documented removal/rollback path. Any write action must still go through host validation and confirmation rules.

**Go/no-go evidence:** a documented use case and maintainer; a tested platform-specific confinement design; adversarial tests demonstrating denial of undeclared access; compatibility and recovery plans; acceptable startup/performance cost; and a plan for signing, distribution, incident response, and deprecation. If isolation cannot be demonstrated on both targets, keep third-party executable plugins out of the product and continue with declarative packs and explicit local tools.

## Cross-cutting decisions and verification

- **Scope and trust are different.** Installation, repository, worktree, and session state answer where a value applies. A separate, local trust decision answers whether a repository-provided executable action may run. A checked-in settings file must not grant its own trust, enable a hook, change security confirmations, or supply secrets.
- **Keep local and shared state distinct.** The existing repo store lives under the common Git directory, so linked worktrees share it. Introduce per-worktree storage only where required; a future version-controlled project file should be opt-in, documented, data-only by default, and reviewed before use. Keep drafts and machine-specific layout state out of exported shared settings.
- **Preserve Git behavior.** Compare ordinary commit, amend, merge, rebase, and lane paths using real disposable repositories. Capture hook stdout/stderr and exit status, preserve user data after failure, and test signing/credential interactions without writing credentials to the OS Keychain. The chosen lane behavior must be documented honestly.
- **Test outcomes, not just controls.** Add focused integration tests for settings migrations and round trips, command conflict resolution, template expansion and Git hooks, and pack isolation. Verify keyboard navigation, contrast, scaling, minimum window dimensions, screen reader labels, reduced motion, and restart recovery on Windows and macOS. For detached windows or executable plugins, add dedicated lifecycle and adversarial tests before shipping.
- **Measure demand without assuming telemetry.** Use direct user feedback and optionally opt-in, privacy-preserving counts of feature use and failures; do not collect repository paths, commit text, tokens, or command arguments. Decide whether to advance to later phases from observed needs and maintenance capacity.

## Suggested first slices

1. Document the alternate-branch lane hook behavior and cover ordinary/lane commit paths with real Git integration tests; decide on a safe implementation from that evidence.
2. Add searchable settings metadata and safe per-setting reset around existing preferences; prove a migration with current keys.
3. Extend the UI/code font picker with independent sizing and richer previews, and verify fallbacks across the main review screens.
4. Add editable shortcuts for a small set of existing action IDs, including conflict detection and a reset, before exposing toolbar or plugin customization.

Reassess after these slices: if users primarily need readability and workspace control, finish those before investing in a public extension ecosystem.
