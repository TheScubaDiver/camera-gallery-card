#!/usr/bin/env node
// rsync the built bundle (and the dev Lovelace loaders) to the configured HA
// host. With --watch, re-rsyncs on every bundle change.
//
// Configured via .env at the repo root:
//   HA_HOST      — SSH alias or user@host (e.g. "hassio@homeassistant.local")
//   HA_DEV_PATH  — absolute path on HA, must end with "/" (e.g. "/config/www/dev/")
//
// Usage:
//   npm run push          (one-shot)
//   npm run push:watch    (watch + re-rsync; used internally by `npm run dev`)

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import chokidar from "chokidar";
import "dotenv/config";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// rsync drops the source path components and uses the basename, so
// dist/camera-gallery-card.js lands at <HA_DEV_PATH>/camera-gallery-card.js
// next to the loaders — keeping the loaders' relative `./camera-gallery-card.js`
// import resolvable.
const FILES = [
  "dist/camera-gallery-card.js",
  "dev/loader.js",
  "dev/loader-hot.js",
];

const { HA_HOST, HA_DEV_PATH } = process.env;

if (!HA_HOST || !HA_DEV_PATH) {
  console.error(
    [
      "[push] HA_HOST or HA_DEV_PATH not set.",
      "       Copy .env.example to .env and fill in both, e.g.",
      "         HA_HOST=hassio@homeassistant.local",
      "         HA_DEV_PATH=/config/www/dev/",
    ].join("\n"),
  );
  process.exit(1);
}

if (!HA_DEV_PATH.endsWith("/")) {
  console.error(`[push] HA_DEV_PATH must end with "/" (got "${HA_DEV_PATH}").`);
  process.exit(1);
}

const watchMode = process.argv.includes("--watch");
const target = `${HA_HOST}:${HA_DEV_PATH}`;

function rsyncOnce({ verbose } = { verbose: false }) {
  const args = [verbose ? "-av" : "-a", ...FILES, target];
  const result = spawnSync("rsync", args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT") {
    console.error("[push] rsync not found on PATH. Install rsync and retry.");
    process.exit(1);
  }
  return result.status === 0;
}

if (!watchMode) {
  console.info(`[push] syncing to ${target}`);
  process.exit(rsyncOnce({ verbose: true }) ? 0 : 1);
}

console.info(`[push] watching dist/camera-gallery-card.js, syncing to ${target}`);
const ok = rsyncOnce();
if (!ok) {
  console.error("[push] initial sync failed; continuing to watch anyway.");
}

const bundlePath = resolve(REPO_ROOT, "dist/camera-gallery-card.js");
let pending = false;

chokidar
  .watch(bundlePath, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100 } })
  .on("all", () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      console.info("[push] bundle changed, syncing...");
      rsyncOnce();
    });
  });

// Make Ctrl-C clean.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => process.exit(0));
}
