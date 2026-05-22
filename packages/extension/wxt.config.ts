import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const rootPkgPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);
const rootVersion = (JSON.parse(readFileSync(rootPkgPath, "utf8")) as { version: string }).version;

// Minimal MV3 config. Permissions stay empty until real entrypoints earn
// them — every new permission is a separate ADR + review.
// Version is read from the root package.json at build time so the MV3
// manifest stays in lockstep with the host tarball (ADR-28).
export default defineConfig({
  manifest: {
    name: "LGTM-Buzzer",
    description: "Quiz yourself on the diff before approving PRs.",
    version: rootVersion,
    permissions: ["storage"],
    host_permissions: [
      "*://github.com/*",
      "*://dev.azure.com/*",
      "*://*.visualstudio.com/*",
    ],
  },
});
