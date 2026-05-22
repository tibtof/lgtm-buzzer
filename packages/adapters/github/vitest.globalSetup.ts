/**
 * Vitest global setup for `packages/adapters/github`.
 *
 * Attempts to spawn an httptape server in serve mode against the local
 * `fixtures/` directory. If the httptape binary is not on PATH, or the
 * fixtures directory is empty, contract tests are skipped cleanly.
 *
 * Environment variable set for contract tests:
 *   `LGTM_BUZZER_GH_HTTPTAPE_URL` — e.g. `http://127.0.0.1:54321`
 *
 * This file is intentionally in the package root (not under `src/`) so it
 * is excluded from the production build.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");
const HTTPTAPE_BIN = process.env["LGTM_BUZZER_HTTPTAPE_BIN"] ?? "httptape";
/** Fixed port for httptape serve — avoids parsing dynamic port from stderr. */
const SERVE_PORT = 54321;

let httptapeProcess: ChildProcess | undefined;

export const setup = async (): Promise<void> => {
  // Skip if fixtures directory has no tape files.
  const fixtureFiles = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR).filter((f) => !f.startsWith("."))
    : [];

  if (fixtureFiles.length === 0) {
    console.warn(
      "[vitest:globalSetup] httptape: no fixture files in fixtures/ — contract tests will skip.",
    );
    return;
  }

  // Attempt to spawn httptape.
  await new Promise<void>((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(HTTPTAPE_BIN, ["serve", "--fixtures", FIXTURES_DIR, "--port", String(SERVE_PORT)], {
        stdio: ["ignore", "ignore", "pipe"],
        env: process.env,
      });
    } catch {
      console.warn(
        `[vitest:globalSetup] httptape binary not found at "${HTTPTAPE_BIN}" — contract tests will skip.`,
      );
      return resolve();
    }

    httptapeProcess = proc;

    let settled = false;
    const settle = (fn: () => void): void => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        console.warn(
          `[vitest:globalSetup] httptape binary not found at "${HTTPTAPE_BIN}" — contract tests will skip.`,
        );
        httptapeProcess = undefined;
        settle(() => resolve());
      } else {
        settle(() => reject(err));
      }
    });

    proc.on("exit", (code) => {
      if (!settled) {
        settle(() =>
          reject(
            new Error(`httptape exited unexpectedly with code ${code ?? "?"}`),
          ),
        );
      }
    });

    // Give httptape 500 ms to start up.
    setTimeout(() => {
      if (httptapeProcess !== undefined) {
        process.env["LGTM_BUZZER_GH_HTTPTAPE_URL"] = `http://127.0.0.1:${SERVE_PORT}`;
        console.info(
          `[vitest:globalSetup] httptape serving fixtures at ${process.env["LGTM_BUZZER_GH_HTTPTAPE_URL"]}`,
        );
      }
      settle(() => resolve());
    }, 500);
  });
};

export const teardown = async (): Promise<void> => {
  if (httptapeProcess !== undefined) {
    httptapeProcess.kill("SIGTERM");
    httptapeProcess = undefined;
    delete process.env["LGTM_BUZZER_GH_HTTPTAPE_URL"];
  }
};
