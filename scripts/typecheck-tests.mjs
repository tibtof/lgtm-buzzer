#!/usr/bin/env node
// Type-check every workspace's *.test.ts files using its own
// tsconfig.test.json. Exits non-zero on the first failure but logs
// the rest. Companion to scripts/build-libs.mjs.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

// Workspaces with their own tsconfig.test.json.
const TEST_PROJECTS = [
  "packages/protocol/tsconfig.test.json",
  "packages/core/tsconfig.test.json",
  "packages/adapters/_shared/tsconfig.test.json",
  "packages/adapters/claude-cli/tsconfig.test.json",
  "packages/adapters/codex-cli/tsconfig.test.json",
  "packages/adapters/copilot-cli/tsconfig.test.json",
  "packages/adapters/github/tsconfig.test.json",
  "packages/adapters/ado/tsconfig.test.json",
  "packages/host/tsconfig.test.json",
];

let failed = false;

for (const project of TEST_PROJECTS) {
  const abs = resolve(ROOT, project);
  if (!existsSync(abs)) {
    console.error(`typecheck:tests — missing ${project}`);
    failed = true;
    continue;
  }
  console.log(`typecheck:tests — ${project}`);
  const r = spawnSync("npx", ["--no-install", "tsc", "-p", abs], { stdio: "inherit" });
  if ((r.status ?? 1) !== 0) failed = true;
}

// Extension already type-checks its tests via its own `compile` script
// (wxt prepare + tsc --noEmit -p tsconfig.json). Delegate.
console.log("typecheck:tests — @lgtm-buzzer/extension (via its compile script)");
const ext = spawnSync(
  "npm",
  ["run", "compile", "--workspace=@lgtm-buzzer/extension"],
  { stdio: "inherit" },
);
if ((ext.status ?? 1) !== 0) failed = true;

process.exit(failed ? 1 : 0);
