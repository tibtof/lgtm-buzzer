#!/usr/bin/env node
/**
 * Generates tests.generated.json by walking the fixtures/ directory.
 *
 * Each fixture folder must contain:
 *   - diff.patch          (the unified diff)
 *   - ground-truth.json   ({ expectedSymbols: string[], notes: string })
 *
 * The output is a JSON array of promptfoo test-case objects:
 *   { description, vars: { diff, expectedSymbols } }
 *
 * Usage:
 *   node scripts/generate-tests.mjs
 *   node scripts/generate-tests.mjs --quick   (3 fast fixtures only)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const FIXTURES_DIR = join(ROOT, "fixtures");
const OUTPUT_PATH = join(ROOT, "tests.generated.json");
const FIXTURES_META = join(FIXTURES_DIR, "fixtures.json");

const isQuick = process.argv.includes("--quick");
const QUICK_SLUGS = new Set(["ts-add-validator", "dep-bump-only"]);
// Note: docs-readme-update is the negative control and goes in the empty-quiz config.

const meta = JSON.parse(readFileSync(FIXTURES_META, "utf8"));
const fixtures = meta.fixtures;

const testCases = [];

for (const fixture of fixtures) {
  if (isQuick && !QUICK_SLUGS.has(fixture.slug)) {
    continue;
  }

  const fixtureDir = join(FIXTURES_DIR, fixture.slug);
  const diffPath = join(fixtureDir, "diff.patch");
  const groundTruthPath = join(fixtureDir, "ground-truth.json");

  if (!existsSync(diffPath) || !existsSync(groundTruthPath)) {
    console.error(`[generate-tests] WARN: missing files in ${fixture.slug}, skipping`);
    continue;
  }

  const diff = readFileSync(diffPath, "utf8");
  const groundTruth = JSON.parse(readFileSync(groundTruthPath, "utf8"));

  testCases.push({
    description: `${fixture.slug} (${fixture.language}, ${fixture.shape})`,
    vars: {
      diff,
      expectedSymbols: groundTruth.expectedSymbols,
    },
  });
}

writeFileSync(OUTPUT_PATH, JSON.stringify(testCases, null, 2), "utf8");
console.log(
  `[generate-tests] Wrote ${testCases.length} test case(s) to ${OUTPUT_PATH}`,
);
