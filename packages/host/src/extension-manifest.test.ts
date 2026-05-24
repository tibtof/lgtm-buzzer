import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Cross-cutting assertion on the built extension manifest. Lives in the host
 * workspace (which has Node access) because the extension workspace bans
 * `node:*` imports by ESLint rule.
 *
 * Asserts release-artifact invariants that have bitten us in real Chrome:
 *   - `nativeMessaging` permission MUST be declared. Without it,
 *     chrome.runtime.connectNative throws synchronously at the SW and the
 *     options page reports "Native host not installed" — even though the
 *     manifest, wrapper, and host are all correctly installed.
 */
describe("built extension manifest", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.resolve(
    __dirname,
    "../../extension/.output/chrome-mv3/manifest.json",
  );

  // The .output dir only exists after `wxt build`. Skip gracefully on a fresh
  // checkout so `npm test` doesn't fail before a first build. CI always runs
  // `npm run build` before tests, so the assertion fires there.
  const built = fs.existsSync(manifestPath);

  it.skipIf(!built)(
    "declares the `nativeMessaging` permission (required for chrome.runtime.connectNative)",
    () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        permissions?: string[];
      };
      expect(manifest.permissions).toContain("nativeMessaging");
    },
  );
});
