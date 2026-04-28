# Contributing

Thanks for contributing to camera-gallery-card.

This guide covers the local dev loop, commit conventions, and how the release pipeline works so you know what to expect after your PR is merged.

## Local development setup

The dev workflow rsyncs the rebuilt bundle into HA's `/config/www/dev/` and registers a small loader as a Lovelace resource that auto-reloads when the file changes.

### Prerequisites

- Node.js (see [`.nvmrc`](.nvmrc) — currently 20)
- HA Advanced SSH & Web Terminal add-on (the basic one has no rsync)
- SSH key auth, ideally with a host alias in `~/.ssh/config`

### Setup

Create the target dir on HA, owned by your SSH user:

```bash
ssh my-ha 'sudo mkdir -p /config/www/dev && sudo chown -R $(whoami): /config/www/dev'
```

Then locally:

```bash
npm install
cp .env.example .env   # set HA_HOST and HA_DEV_PATH
npm run push
```

In HA, add a Lovelace resource at Settings → Dashboards → ⋮ → Resources:

- Type: JavaScript Module
- URL: `/local/dev/loader.js` for manual reloads, or `/local/dev/loader-hot.js` for auto reload

Remove any existing `/hacsfiles/camera-gallery-card/...` resource. Only one entry per custom element name will work.

### Develop

```bash
npm run dev
```

Two watchers run side-by-side: Rollup watches `src/` and rebuilds `dist/camera-gallery-card.js` on every save; `scripts/dev/push.mjs --watch` watches that bundle file and rsyncs it to HA. With `loader-hot.js`, the dashboard reloads itself a couple of seconds after the bundle changes on disk.

Other useful scripts:

| Script              | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | The main dev loop: build watch + auto-rsync to HA.      |
| `npm run build:watch` | Just Rollup watch — builds locally, no rsync. Rare.   |
| `npm run push`      | One-shot rsync of the current bundle and dev loaders.   |
| `npm run push:watch` | Rsync on every bundle change. Used internally by `dev`. |
| `npm run build`     | One-shot production build.                              |

### How it works

`loader.js` registers as a stable URL but imports `camera-gallery-card.js?v=<timestamp>` on each page load, so the browser cache and service worker can't serve stale code. `loader-hot.js` adds a 2-second poll on `Last-Modified` and calls `location.reload()` when it changes.

The rsync logic lives in [`scripts/dev/push.mjs`](scripts/dev/push.mjs) — it loads `.env` via [`dotenv`](https://github.com/motdotla/dotenv), validates `HA_HOST` and `HA_DEV_PATH`, and runs `rsync` directly. `--watch` adds a [`chokidar`](https://github.com/paulmillr/chokidar) watcher on the bundle file.

### Troubleshooting

- **`Cannot find .env file` from Node.** Run `cp .env.example .env` and fill in `HA_HOST` / `HA_DEV_PATH`.
- **Card doesn't update after a change.** Browser or service-worker cache. The dev loaders sidestep this; if you wired up a different resource URL, force-reload with Ctrl/Cmd-Shift-R or use `loader-hot.js`. Also check Lovelace → Resources for a stale `/hacsfiles/camera-gallery-card/...` entry — only one resource per custom-element tag will work, so leave just `/local/dev/loader.js` (or `loader-hot.js`) while developing.
- **rsync says "permission denied" or "no such directory".** Run the SSH command from the [Setup](#setup) section first to create the target dir with the right ownership.
- **rsync isn't found / Windows.** The dev loop uses `rsync` and `ssh`. On Windows, run it under WSL.

## Before opening a PR

```bash
npm run check
```

That runs typecheck, lint, format check, and build — exactly what CI runs. If any step fails locally, CI will fail too.

If you touched `src/`, also commit the rebuilt `dist/camera-gallery-card.js` alongside your source changes. CI rejects PRs where the committed bundle is out of sync with `src/`.

### Pre-commit hook

`npm install` sets up [husky](https://typicode.github.io/husky/) automatically (via the `prepare` script). On every commit, [lint-staged](https://github.com/lint-staged/lint-staged) runs `eslint --fix` and `prettier --write` on the staged files only — fast, scoped, and the auto-fixed files are folded back into the same commit. If you ever need to bypass the hook (e.g. a WIP commit), use `git commit --no-verify`.

## Commit and PR conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) for one specific reason: [release-please](https://github.com/googleapis/release-please) reads them to decide the next version and to generate the changelog.

PRs land via **squash merge**. Whatever you put in the PR title becomes the conventional commit on `main`, so the title is what matters. CI enforces that the PR title is conventional.

### PR title format

```
<type>(<optional scope>): <subject>
```

Common types and what they trigger:

| Type       | Use for                                | Bumps version?        |
|------------|----------------------------------------|-----------------------|
| `feat`     | new user-visible feature               | minor (e.g. 2.6 → 2.7) |
| `fix`      | bug fix                                | patch (e.g. 2.6.0 → 2.6.1) |
| `perf`     | performance improvement                | patch                 |
| `refactor` | code restructuring, no behavior change | no                    |
| `docs`     | README / CONTRIBUTING / comments only  | no                    |
| `test`     | tests only                             | no                    |
| `build`    | build system, dependencies             | no                    |
| `ci`       | CI workflow changes                    | no                    |
| `chore`    | other maintenance                      | no                    |
| `revert`   | revert a previous commit               | depends on what's reverted |

A breaking change is signaled by either `feat!:` / `fix!:` (the `!` after the type) or a `BREAKING CHANGE:` footer in the PR body. That triggers a major bump.

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

### Scope (optional)

Use a scope when it helps readers find the change in the changelog: `editor`, `live`, `media`, `sensor`, `deps`, etc. Scopes aren't enforced — leave blank if nothing fits.

### Subject

- Lowercase first letter (`feat: add ...`, not `feat: Add ...`).
- Imperative mood (`add`, not `added` or `adds`).
- No trailing period.
- Keep it under ~72 characters.

## How releases work

You don't tag releases manually. The pipeline does it.

1. PRs merge into `main` with conventional-commit titles.
2. On every push to `main`, the `Release` workflow runs `release-please-action`. It opens (or updates) a single **release PR** titled `chore(main): release X.Y.Z` that bumps `package.json` and regenerates `CHANGELOG.md`. A follow-up job in the same workflow run rebuilds `camera-gallery-card.js` on the release PR's branch, so the release commit ships a bundle whose `CARD_VERSION` matches the bumped version.
3. When a maintainer is ready to ship, they review the release PR and **squash-merge** it.
4. release-please tags `vX.Y.Z` and creates the GitHub Release. The same workflow then attaches the committed `camera-gallery-card.js` from the tagged commit as a release asset (no rebuild — the asset is byte-identical to what's on `main`).
5. HACS picks up the new release automatically — both for users on tagged installs (latest release) and users on the default branch (the bundle is already committed to `main`).

### Manual release (escape hatch)

If something breaks the automated pipeline, a maintainer can dispatch the `Release` workflow manually from the Actions tab. Same release-please logic, just triggered by hand.

### Breaking changes

Major bumps happen **only** when a commit on the way to `main` includes `!` after the type or a `BREAKING CHANGE:` footer. Otherwise everything stays in the same major line.

## Linting, formatting, types

- `npm run lint` — ESLint flat config (`eslint.config.js`). `no-console` is a warning; only `console.info`, `console.warn`, `console.error` are allowed.
- `npm run format` / `npm run format:check` — Prettier.
- `npm run typecheck` — `tsc --noEmit` on the JS sources via `allowJs`.
