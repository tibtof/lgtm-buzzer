import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NATIVE_HOST_ID } from "./host-id.js";

describe("NATIVE_HOST_ID", () => {
  it("uses the dot-separated lowercase form required by native messaging", () => {
    expect(NATIVE_HOST_ID).toBe("com.lgtm_buzzer.host");
  });

  it("matches the native messaging host name regex", () => {
    expect(NATIVE_HOST_ID).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
  });
});

describe("built manifest", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.resolve(
    __dirname,
    "../../.output/chrome-mv3/manifest.json",
  );

  // The .output dir only exists after `wxt build`. Skip gracefully on a fresh
  // checkout so this test doesn't block `npm test` before a first build. CI
  // always runs `npm run build` before tests, so the assertion fires there.
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
