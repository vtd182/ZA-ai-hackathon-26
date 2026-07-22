#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const watchRoots = [
  "cmd",
  "core",
  "plugin/src",
  "plugin/package.json",
  "plugin/vite.config.ts",
  "plugin/vite.config.main.ts",
  "plugin/svelte.config.js",
  "Makefile",
];

const ignored = new Set([".git", "bin", "dist", "tmp", "node_modules"]);
let lastSnapshot = new Map();
let running = false;
let queued = false;

function walk(target, out) {
  const full = path.join(root, target);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      walk(path.join(target, entry.name), out);
    }
    return;
  }
  out.set(target, stat.mtimeMs);
}

function snapshot() {
  const out = new Map();
  for (const target of watchRoots) walk(target, out);
  return out;
}

function diffKinds(prev, next) {
  const changed = [];
  for (const [file, mtime] of next.entries()) {
    if (prev.get(file) !== mtime) changed.push(file);
  }
  for (const file of prev.keys()) {
    if (!next.has(file)) changed.push(file);
  }
  const kinds = new Set();
  for (const file of changed) {
    if (file.startsWith("plugin/")) kinds.add("plugin");
    if (file.startsWith("core/") || file.startsWith("cmd/") || file === "Makefile") kinds.add("go");
  }
  return { changed, kinds };
}

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function rebuild(kinds) {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    if (kinds.has("go")) {
      console.log("[dev-watch] rebuilding Go binary");
      await run("go", ["build", "-o", "bin/za-talk-to-figma", "./cmd/za-talk-to-figma"]);
      console.log("[dev-watch] reloading running MCP/runtime processes");
      await run(path.join(root, "scripts/reload-mcp.sh"), []);
    }
    if (kinds.has("plugin")) {
      console.log("[dev-watch] rebuilding plugin bundle");
      await run("bun", ["run", "build"], path.join(root, "plugin"));
    }
    console.log("[dev-watch] ready");
  } catch (error) {
    console.error("[dev-watch] build failed:", error.message);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      const next = snapshot();
      const { kinds: queuedKinds } = diffKinds(lastSnapshot, next);
      lastSnapshot = next;
      if (queuedKinds.size > 0) await rebuild(queuedKinds);
    }
  }
}

console.log("[dev-watch] watching cmd/, core/, and plugin/src ...");
lastSnapshot = snapshot();

setInterval(async () => {
  const next = snapshot();
  const { changed, kinds } = diffKinds(lastSnapshot, next);
  if (changed.length === 0) return;
  lastSnapshot = next;
  console.log("[dev-watch] changes detected:", changed.slice(0, 6).join(", "), changed.length > 6 ? "..." : "");
  await rebuild(kinds);
}, 1000);
