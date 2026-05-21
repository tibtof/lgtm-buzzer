#!/usr/bin/env node
// Wraps `tsc -b` so an empty root tsconfig (no references yet) is a no-op
// instead of TS18002. Lets every scaffold commit leave `npm run build` green.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const cfg = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const refs = Array.isArray(cfg.references) ? cfg.references : [];
if (refs.length === 0) {
  console.log("build:libs — no TypeScript projects registered yet, skipping tsc -b");
  process.exit(0);
}
const result = spawnSync("npx", ["--no-install", "tsc", "-b"], { stdio: "inherit" });
process.exit(result.status ?? 1);
