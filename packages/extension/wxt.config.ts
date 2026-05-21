import { defineConfig } from "wxt";

// Minimal MV3 config. Permissions stay empty until real entrypoints earn
// them — every new permission is a separate ADR + review.
export default defineConfig({
  manifest: {
    name: "LGTM-Buzzer",
    description: "Quiz yourself on the diff before approving PRs.",
    version: "0.0.0",
    permissions: [],
    host_permissions: ["*://github.com/*", "*://dev.azure.com/*"],
  },
});
