# Contributing

Thanks for contributing to camera-gallery-card. This guide walks you through the full flow — from cloning the repo to seeing your change in a released version — and lists the tooling and conventions you'll run into along the way.

## Quick reference

```bash
# one-time setup
git clone https://github.com/<your-username>/camera-gallery-card.git
cd camera-gallery-card
npm install
cp .env.example .env   # set HA_HOST and HA_DEV_PATH

# every change
git switch -c fix/some-bug                  # or feat/...
npm run dev                                 # rebuilds + rsyncs to HA on save
# ... edit src/index.js, watch the dashboard auto-reload ...
npm run check                               # typecheck + lint + format + build
git add -A && git commit -m "fix: short description"
git push -u origin fix/some-bug
gh pr create --base main                    # or open via the GitHub UI
```

The PR title is what matters — it must be a [conventional commit](#commit-and-pr-title-format) (e.g. `fix: prevent timer leak`). It becomes the squash-merge commit on `main`, and the release pipeline reads it to decide the next version and generate the changelog.

## The full flow, end to end

### 1. Fork the repo

Click **Fork** in the top-right of [TheScubaDiver/camera-gallery-card](https://github.com/TheScubaDiver/camera-gallery-card). You'll get your own copy at `https://github.com/<your-username>/camera-gallery-card`.

### 2. Clone your fork and add upstream as a remote

```bash
git clone https://github.com/<your-username>/camera-gallery-card.git
cd camera-gallery-card
git remote add upstream https://github.com/TheScubaDiver/camera-gallery-card.git
```

### 3. One-time local setup

Install dependencies. This also installs the husky pre-commit hook automatically (via the `prepare` script in `package.json`).

```bash
npm install
```

Set up your `.env` for the dev loop (next step). Copy the example file and fill in your HA host and target path:

```bash
cp .env.example .env
```

Then edit `.env`:

```
HA_HOST=hassio@homeassistant.local       # or an SSH alias from ~/.ssh/config
HA_DEV_PATH=/config/www/dev/             # absolute path on HA, must end with /
```

On HA, create the target directory once with the right ownership (otherwise rsync will fail):

```bash
ssh my-ha 'sudo mkdir -p /config/www/dev && sudo chown -R $(whoami): /config/www/dev'
```

In your HA dashboard, go to **Settings → Dashboards → ⋮ → Resources** and add a JavaScript Module pointing to one of:

- `/local/dev/loader-hot.js` — dashboard auto-reloads when the bundle changes (recommended)
- `/local/dev/loader.js` — manual reload

Important: **disable any existing `/hacsfiles/camera-gallery-card/...` resource** while you're developing. Lovelace only honors one resource per custom-element name; if both are active you'll get unpredictable behavior.

### 4. Create a branch

Branch off `main` in your fork. Use a descriptive name that hints at the change. The conventional pattern matches the commit type:

```bash
git fetch upstream
git switch -c fix/mic-error-timer-leak upstream/main
# or
git switch -c feat/multi-camera-picker upstream/main
```

### 5. Run the dev loop

```bash
npm run dev
```

This runs two watchers side-by-side:

1. **Rollup** watches `src/` and rebuilds `dist/camera-gallery-card.js` whenever you save.
2. **`scripts/dev/push.mjs --watch`** watches the rebuilt bundle and rsyncs it (along with the dev loaders) to your HA at `$HA_HOST:$HA_DEV_PATH`.

With `loader-hot.js`, your dashboard reloads itself a couple of seconds after each save. Edit `src/index.js`, save, watch the change appear live in HA.

Stop with Ctrl-C. Both watchers shut down together.

### 6. Verify locally before pushing

```bash
npm run check
```

This is the same set of steps CI runs on your PR — type-check, lint, prettier check, build, and bundle drift guard. If anything fails locally it'll fail on CI, so fix it now.

If you touched anything in `src/`, **commit the rebuilt `dist/camera-gallery-card.js` alongside your source changes**. The drift guard rejects PRs where the committed bundle doesn't match what `npm run build` produces from `src/`.

### 7. Commit

The pre-commit hook (husky + lint-staged) runs `eslint --fix` and `prettier --write` on staged files automatically — auto-fixes are folded into the same commit. If you ever need to bypass the hook (e.g. for a WIP commit you'll squash later), use `git commit --no-verify`.

Commit messages on your branch don't have to be conventional commits — only the **PR title** does, because that's what becomes the squash-merge commit on `main`. Keep your branch commits as granular as you like; nobody sees them on `main`.

### 8. Push and open a PR

```bash
git push -u origin <your-branch-name>
gh pr create --repo TheScubaDiver/camera-gallery-card --base main
```

Or use the GitHub UI link printed by `git push`.

**The PR title is critical** — see [Commit and PR title format](#commit-and-pr-title-format). CI rejects PRs whose title isn't a conventional commit. The PR title becomes the squash-merge commit message on `main`, which is what release-please reads to decide whether to bump major / minor / patch.

A good PR description includes:

- **What** changed and **why** (1–3 sentences).
- A **test plan** (a checkbox list of what you verified — including any HA-side testing).
- **Screenshots** if it's a visual change.
- **Reference issues** if applicable (`Closes #123`).

### 9. Iterate on review

CI runs on every push to your PR branch:

- **Check PR title is conventional** — runs the [PR-title workflow](.github/workflows/pr-title.yml) against your title.
- **build** — runs `npm run check` (typecheck, lint, format, build, drift guard).
- **validate** — runs HACS structural validation.

If any of these fail, fix and push again. Each push re-runs CI automatically.

A maintainer (currently @TheScubaDiver and @ErikBavenstrand) is auto-requested as reviewer. Address any feedback by pushing more commits.

### 10. Merge

A maintainer **squash-merges** your PR. The squash commit on `main` uses your PR title as its message. This is the only path PRs land — branch protection blocks regular merge and rebase.

After merge, your branch on the fork is auto-deleted. The merge commit triggers the **Release workflow** (next section).

### 11. release-please opens (or updates) a release PR

On every push to `main`, the [Release workflow](.github/workflows/release.yml) runs `release-please-action`, which:

1. Reads the new conventional-commit message.
2. Decides whether to bump major (breaking change), minor (`feat`), patch (`fix` / `perf`), or do nothing (`chore`, `docs`, `ci`, `refactor`, etc).
3. Opens (or updates) a single PR titled something like `chore(main): release 2.7.0` that bumps `package.json` and regenerates `CHANGELOG.md`.
4. A follow-up job in the same workflow rebuilds `dist/camera-gallery-card.js` so the release commit ships a bundle whose `CARD_VERSION` matches the bumped version.

**Where to look:** the **Pull requests** tab on the upstream repo. The release PR will be open and labeled `autorelease: pending`. CI runs on it like any other PR.

If your PR was a `chore`/`ci`/`docs`/`refactor`, no release PR is opened — those types don't trigger a version bump. Your change will be included in the *next* release that's triggered by a `feat` or `fix`.

### 12. Maintainer ships the release

When a maintainer is ready, they squash-merge the release PR. release-please then:

1. Tags `vX.Y.Z` on `main`.
2. Creates a GitHub Release at that tag.
3. Attaches `dist/camera-gallery-card.js` as a release asset.

HACS picks up the new release automatically — users on tagged installs get it via the release asset, users on the default branch get the bundle that's already committed to `main`.

**Where to look:** the **Releases** sidebar on the repo. A new release should appear within ~30 seconds of the release PR merging. The asset (`camera-gallery-card.js`) should be listed as a downloadable file.

## Commit and PR title format

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). PR titles must match:

```
<type>(<optional scope>)!?: <subject>
```

| Type       | Use for                                | Triggers              |
| ---------- | -------------------------------------- | --------------------- |
| `feat`     | new user-visible feature               | minor bump (2.6 → 2.7) |
| `fix`      | bug fix                                | patch bump (2.6.0 → 2.6.1) |
| `perf`     | performance improvement                | patch                 |
| `refactor` | code restructuring, no behavior change | no release            |
| `docs`     | README / CONTRIBUTING / comments only  | no release            |
| `test`     | tests only                             | no release            |
| `build`    | build system, dependencies             | no release            |
| `ci`       | CI workflow changes                    | no release            |
| `chore`    | other maintenance                      | no release            |
| `revert`   | revert a previous commit               | depends               |

**Breaking changes** trigger a major bump. Signal them with either `!` after the type (`feat!:`) or a `BREAKING CHANGE:` footer in the PR body.

### Subject rules

- Lowercase first letter — `feat: add multi-camera live view`, not `feat: Add ...`.
- Imperative mood — `add`, not `added` or `adds`.
- No trailing period.
- Under ~72 characters.

### Scope (optional)

Use a scope when it helps readers find the change in the changelog: `editor`, `live`, `media`, `sensor`, `deps`, etc. Scopes aren't enforced — leave it blank if nothing fits.

### Examples

```
feat: add multi-camera live view picker
fix: prevent _micErrorTimer leak in disconnectedCallback
fix(editor): align thumbnail strip side padding
perf: throttle sensor poster work to 8 concurrent
docs: clarify Frigate snapshot detection in README
chore(deps): bump rollup from 4.24.0 to 4.25.0
feat!: drop support for source_mode "files" alias
```

## Useful npm scripts

| Script                | What it does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| `npm run dev`         | The main dev loop: build watch + auto-rsync to HA.                    |
| `npm run build`       | One-shot production build (terser-minified, no source map).           |
| `npm run build:watch` | Just Rollup watch — builds locally, no rsync. Rare.                   |
| `npm run push`        | One-shot rsync of the current bundle and dev loaders.                 |
| `npm run push:watch`  | Rsync on every bundle change. Used internally by `npm run dev`.       |
| `npm run check`       | Typecheck + lint + format check + build. Same as CI.                  |
| `npm run lint`        | ESLint only.                                                          |
| `npm run lint:fix`    | ESLint with `--fix`.                                                  |
| `npm run format`      | Prettier `--write`.                                                   |
| `npm run format:check`| Prettier `--check`.                                                   |
| `npm run typecheck`   | `tsc --noEmit`.                                                       |
| `npm run clean`       | Delete `dist/`.                                                       |

## How the dev loaders work

`dev/loader.js` registers as a stable URL but dynamically imports `camera-gallery-card.js?v=<timestamp>` on each page load — that bypasses both the browser cache and HA's service worker, which would otherwise serve stale code.

`dev/loader-hot.js` does the same plus a 2-second poll on the bundle's `Last-Modified` header. When the file changes (after rsync), it calls `location.reload()`. Polling pauses when the tab is hidden so it's idle in the background.

Both loaders get rsynced to HA alongside the bundle. The rsync logic lives in [`scripts/dev/push.mjs`](scripts/dev/push.mjs) — it loads `.env` via [`dotenv`](https://github.com/motdotla/dotenv), validates `HA_HOST` and `HA_DEV_PATH`, and runs `rsync`. `--watch` adds a [`chokidar`](https://github.com/paulmillr/chokidar) watcher.

## Linting, formatting, types

- **ESLint** flat config (`eslint.config.js`). `no-console` is a warning; only `console.info`, `console.warn`, `console.error` are allowed. The legacy `src/index.js` blob is intentionally exempt from strict rules until it's broken into focused modules.
- **Prettier** for formatting. `src/index.js` is exempt (see `.prettierignore`).
- **TypeScript** in noEmit mode for type-checking the JS sources via `allowJs`. Strict settings.

## Troubleshooting

- **`Cannot find .env file`**: run `cp .env.example .env` and fill in `HA_HOST` / `HA_DEV_PATH`.
- **rsync says "permission denied" or "no such directory"**: run the SSH `mkdir`+`chown` command from [step 3](#3-one-time-local-setup) once. The target directory has to exist and be owned by your SSH user.
- **rsync isn't found / Windows**: the dev loop uses `rsync` and `ssh`. On Windows, run it under WSL.
- **Card doesn't update in the browser after a change**: cache. The dev loaders sidestep this; if you wired up a different resource URL, hard-refresh with Ctrl/Cmd-Shift-R or switch to `loader-hot.js`. Also check Lovelace → Resources for a stale `/hacsfiles/camera-gallery-card/...` entry — only one resource per custom-element tag works, so leave just `/local/dev/loader.js` (or `loader-hot.js`) while developing.
- **`drift guard` CI step fails**: you changed `src/` but didn't commit the rebuilt bundle. Run `npm run build` and commit `dist/camera-gallery-card.js`.
- **PR-title check fails**: your title isn't a [conventional commit](#commit-and-pr-title-format). Edit it on the GitHub PR page; the check re-runs automatically.

## Maintainer notes

After merging a PR, the **Release** workflow run on `main` is what to watch. It either:

- Opens or updates a release PR (most common — your change is grouped with everything else since the last release).
- Does nothing (your change was a `chore`/`ci`/`docs`/etc. that doesn't trigger a bump — totally fine).

If the workflow run fails, click into the failed job to diagnose. Common causes:

- **Token errors** (`error:1E08010C:DECODER routines::unsupported`, `Bad credentials`): the `RELEASE_BOT_PRIVATE_KEY` secret or `RELEASE_BOT_CLIENT_ID` variable on the upstream repo is misconfigured.
- **Drift guard fails on the release PR**: the rebuild-bundle step in `release.yml` should have caught this — investigate why it didn't run.

When merging the release PR, double-check:

1. The proposed version number matches what you'd expect from the commits since the last release.
2. The CHANGELOG.md diff in the release PR lists every PR you intended to ship.
3. CI is green on the release PR.
4. The version in the README's "Current version" line was bumped, and **only** that line — release-please's `generic` updater can be greedy about matching `(\d+)\.(\d+)\.(\d+)` patterns when block markers span multiple lines. We use the **inline marker** form (`<!-- x-release-please-version -->` on the same line as the version literal) so only that one line is touched. If you ever add `extra-files` for another file, prefer the inline marker pattern and double-check the next release PR's diff for collateral damage.
