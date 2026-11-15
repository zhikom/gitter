# Repository instructions

## Release notes and publishing

- Before pushing to GitHub, update `CHANGELOG.md` with accurate, user-facing
  notes for the changes being pushed. Keep unfinished changes under
  `Unreleased`; do not silently rewrite notes for a published version.
- When a release is requested, move its notes into a dated version section,
  synchronize the version in `package.json`, `package-lock.json`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and
  `src-tauri/tauri.conf.json`, and commit the changes to `main`.
- Push a matching `vX.Y.Z` tag only when publishing a release is authorized.
  The release workflow reads that version's changelog section, waits for the
  checks and both builds, then publishes the GitHub release. Verify the workflow,
  release notes, and downloadable assets after it finishes.
- Release installers only for Windows x64 and macOS ARM64 (Apple Silicon).
  Do not add Linux, Intel Mac, or universal Mac release builds without a new
  user instruction. Preserve older published releases unless asked to alter them.
- Report distribution-signing limitations accurately; an ad-hoc macOS
  signature is not Apple notarization.

## Local test builds

- Give experimental builds release-candidate versions such as `1.12.1-rc.1`;
  use numeric `X.Y.Z` versions for stable builds and do not name test apps
  “Preview”. Keep test data separate from the stable app's data.
- After testing, remove the temporary release-candidate apps, their registrations,
  and test-only data. Leave the latest stable `Gitter.app` installed, preserving
  the user's repositories and stable settings.
